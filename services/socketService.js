const socketIO = require('socket.io');

class WebSocketService {
    constructor() {
        this.io = null;
        this.connectedClients = new Map();
        this.eventRateLimits = new Map();
        this.isShuttingDown = false;
        this.authMiddleware = null;

        this.config = {
            cors: {
                origin: 'http://localhost:5173',
                methods: ['GET', 'POST'],
                credentials: true
            },
            pingTimeout: 60000,
            pingInterval: 25000,
            maxHttpBufferSize: 1e6,
            transports: ['websocket', 'polling'],
            allowUpgrades: true
        };
        this.rateLimitConfig = {
            maxEventsPerMinute: 100,
            windowMs: 60000
        }
        this.supportedEntities = [
            'client',
            'department',
            'contact',
            'candidate',
            'user',
            'jobProfile',
            'lookup'
        ];
    }
    initialize(server, authMiddleware) {
        if (this.io) {
            console.warn('WebSocket service already initialized');
            return this.io;
        }

        if (!authMiddleware || typeof authMiddleware !== 'function') {
            throw new Error('Authentication middleware is required');
        }

        this.authMiddleware = authMiddleware;
        this.io = socketIO(server, this.config);

        // Use your existing auth middleware
        this.io.use(this.authenticateSocket.bind(this));

        // Connection handler
        this.io.on('connection', this.handleConnection.bind(this));

        // Error handler
        this.io.engine.on('connection_error', this.handleConnectionError.bind(this));

        console.log('✓ WebSocket service initialized successfully');
        return this.io;
    }

    async authenticateSocket(socket, next) {
        try {
            const token = socket.handshake.auth.token ||
                socket.handshake.headers.authorization?.replace('Bearer ', '');

            if (!token) {
                return next(new Error('Authentication token required'));
            }

            // Create mock request/response objects for your middleware
            const mockReq = {
                headers: {
                    authorization: `Bearer ${token}`
                }
            };

            const mockRes = {
                status: (code) => ({
                    json: (data) => {
                        next(new Error(data.message || 'Authentication failed'));
                    }
                })
            };

            // Call your existing auth middleware
            await this.authMiddleware(mockReq, mockRes, (error) => {
                if (error) {
                    return next(error);
                }

                // Extract user info from your middleware (adjust based on your implementation)
                socket.userId = mockReq.user?.memberId || mockReq.user?.memberId;
                socket.userRole = mockReq.user?.designation;
                socket.username = mockReq.user?.email;
                socket.user = mockReq.user;

                console.log(`Socket authenticated: ${socket.username} (${socket.userId})`);
                next();
            });
        } catch (error) {
            console.error('Socket authentication failed:', error.message);
            next(new Error('Invalid authentication token'));
        }
    }

    handleConnection(socket) {
        if (this.isShuttingDown) {
            socket.disconnect(true);
            return;
        }

        const clientInfo = {
            socketId: socket.id,
            userId: socket.userId,
            username: socket.username,
            role: socket.userRole,
            connectedAt: new Date(),
            lastActivity: new Date(),
            subscriptions: new Set()
        };

        this.connectedClients.set(socket.id, clientInfo);

        console.log(`Client connected: ${socket.username} (Total: ${this.connectedClients.size})`);

        // Join user-specific room
        socket.join(`user:${socket.userId}`);

        // Join global updates room
        socket.join('global:updates');

        // Send connection acknowledgment
        socket.emit('connected', {
            socketId: socket.id,
            timestamp: new Date().toISOString(),
            message: 'Successfully connected to real-time updates',
            supportedEntities: this.supportedEntities
        });

        // Handle disconnection
        socket.on('disconnect', (reason) => this.handleDisconnect(socket, reason));

        // Handle ping/pong for heartbeat
        socket.on('ping', () => {
            this.updateClientActivity(socket.id);
            socket.emit('pong', { timestamp: new Date().toISOString() });
        });

        // Handle entity subscription
        socket.on('subscribe', (data) => {
            this.handleSubscription(socket, data);
        });

        socket.on('unsubscribe', (data) => {
            this.handleUnsubscription(socket, data);
        });

        // Handle errors
        socket.on('error', (error) => {
            console.error(`Socket error for ${socket.username}:`, error);
        });

        // Emit initial stats
        this.emitConnectionStats(socket);
    }
    handleSubscription(socket, data) {
        const { entity, id } = data || {};

        if (!entity || !this.supportedEntities.includes(entity)) {
            socket.emit('error', {
                message: `Invalid entity. Supported: ${this.supportedEntities.join(', ')}`
            });
            return;
        }

        // Subscribe to all updates for this entity type
        const entityRoom = `${entity}:updates`;
        socket.join(entityRoom);

        const clientInfo = this.connectedClients.get(socket.id);
        if (clientInfo) {
            clientInfo.subscriptions.add(entityRoom);
        }

        // If specific ID provided, subscribe to that resource
        if (id) {
            const resourceRoom = `${entity}:${id}`;
            socket.join(resourceRoom);

            if (clientInfo) {
                clientInfo.subscriptions.add(resourceRoom);
            }

            console.log(`${socket.username} subscribed to ${entity} ${id}`);
            socket.emit('subscribed', { entity, id, room: resourceRoom });
        } else {
            console.log(`${socket.username} subscribed to all ${entity} updates`);
            socket.emit('subscribed', { entity, room: entityRoom });
        }
    }

    handleUnsubscription(socket, data) {
        const { entity, id } = data || {};

        if (!entity) {
            socket.emit('error', { message: 'Entity type required' });
            return;
        }

        const clientInfo = this.connectedClients.get(socket.id);

        if (id) {
            const resourceRoom = `${entity}:${id}`;
            socket.leave(resourceRoom);

            if (clientInfo) {
                clientInfo.subscriptions.delete(resourceRoom);
            }

            console.log(`${socket.username} unsubscribed from ${entity} ${id}`);
            socket.emit('unsubscribed', { entity, id });
        } else {
            const entityRoom = `${entity}:updates`;
            socket.leave(entityRoom);

            if (clientInfo) {
                clientInfo.subscriptions.delete(entityRoom);
            }

            console.log(`${socket.username} unsubscribed from ${entity} updates`);
            socket.emit('unsubscribed', { entity });
        }
    }
    handleDisconnect(socket, reason) {
        const clientInfo = this.connectedClients.get(socket.id);

        if (clientInfo) {
            console.log(`Client disconnected: ${clientInfo.username} - Reason: ${reason}`);
            this.connectedClients.delete(socket.id);
        }

        this.eventRateLimits.delete(socket.id);
    }
    handleConnectionError(error) {
        console.error('WebSocket connection error:', {
            message: error.message,
            code: error.code,
            context: error.context
        });
    }
    updateClientActivity(socketId) {
        const client = this.connectedClients.get(socketId);
        if (client) {
            client.lastActivity = new Date();
        }
    }
    emitConnectionStats(socket) {
        const clientInfo = this.connectedClients.get(socket.id);
        const stats = {
            totalConnections: this.connectedClients.size,
            yourConnectionTime: new Date().toISOString(),
            yourSubscriptions: clientInfo ? Array.from(clientInfo.subscriptions) : []
        };
        socket.emit('stats', stats);
    }
    emitCreated(entity, data, user = {}) {
        if (!this.io || !this.supportedEntities.includes(entity)) {
            console.warn(`Cannot emit event for unsupported entity: ${entity}`);
            return;
        }

        const event = {
            type: `${entity.toUpperCase()}_CREATED`,
            entity,
            timestamp: new Date().toISOString(),
            data,
            user: {
                id: user.userId,
                username: user.username
            }
        };

        // Broadcast to entity-specific room
        this.io.to(`${entity}:updates`).emit(`${entity}:created`, event);

        // Also broadcast to global room
        this.io.to('global:updates').emit('entity:created', event);

        console.log(`Broadcasted ${entity.toUpperCase()}_CREATED event`);
    }
    emitUpdated(entity, data, changes = {}, user = {}) {
        if (!this.io || !this.supportedEntities.includes(entity)) {
            console.warn(`Cannot emit event for unsupported entity: ${entity}`);
            return;
        }

        const entityId = this.extractEntityId(entity, data);

        const event = {
            type: `${entity.toUpperCase()}_UPDATED`,
            entity,
            timestamp: new Date().toISOString(),
            data,
            changes,
            user: {
                id: user.userId,
                username: user.username
            }
        };

        // Broadcast to entity-specific room
        this.io.to(`${entity}:updates`).emit(`${entity}:updated`, event);

        // Broadcast to specific resource room if ID exists
        if (entityId) {
            this.io.to(`${entity}:${entityId}`).emit(`${entity}:updated`, event);
        }

        // Also broadcast to global room
        this.io.to('global:updates').emit('entity:updated', event);

        console.log(`Broadcasted ${entity.toUpperCase()}_UPDATED event for ID: ${entityId}`);
    }
    emitDeleted(entity, idOrData, user = {}) {
        if (!this.io || !this.supportedEntities.includes(entity)) {
            console.warn(`Cannot emit event for unsupported entity: ${entity}`);
            return;
        }

        const entityId = typeof idOrData === 'object'
            ? this.extractEntityId(entity, idOrData)
            : idOrData;

        const event = {
            type: `${entity.toUpperCase()}_DELETED`,
            entity,
            timestamp: new Date().toISOString(),
            data: typeof idOrData === 'object' ? idOrData : { [`${entity}Id`]: entityId },
            user: {
                id: user.userId,
                username: user.username
            }
        };

        // Broadcast to entity-specific room
        this.io.to(`${entity}:updates`).emit(`${entity}:deleted`, event);

        // Broadcast to specific resource room
        if (entityId) {
            this.io.to(`${entity}:${entityId}`).emit(`${entity}:deleted`, event);
        }

        // Also broadcast to global room
        this.io.to('global:updates').emit('entity:deleted', event);

        console.log(`Broadcasted ${entity.toUpperCase()}_DELETED event for ID: ${entityId}`);
    }
    emitBulkOperation(entity, operation, summary, user = {}) {
        if (!this.io || !this.supportedEntities.includes(entity)) {
            console.warn(`Cannot emit event for unsupported entity: ${entity}`);
            return;
        }

        const event = {
            type: `${entity.toUpperCase()}_${operation}`,
            entity,
            operation,
            timestamp: new Date().toISOString(),
            summary,
            user: {
                id: user.userId,
                username: user.username
            }
        };

        this.io.to(`${entity}:updates`).emit(`${entity}:bulk`, event);
        this.io.to('global:updates').emit('entity:bulk', event);

        console.log(`Broadcasted ${entity.toUpperCase()}_${operation} event`);
    }
    emitToUser(userId, notification) {
        if (!this.io) return;

        this.io.to(`user:${userId}`).emit('notification', {
            timestamp: new Date().toISOString(),
            ...notification
        });
    }
    emitCustom(room, eventName, data) {
        if (!this.io) return;

        this.io.to(room).emit(eventName, {
            timestamp: new Date().toISOString(),
            ...data
        });
    }
    extractEntityId(entity, data) {
        if (!data || typeof data !== 'object') return null;

        // Try common patterns
        const patterns = [
            `${entity}Id`,           // clientId
            `${entity}_id`,          // client_id
            'id',                    // id
            `${entity}ID`            // clientID
        ];

        for (const pattern of patterns) {
            if (data[pattern] !== undefined) {
                return data[pattern];
            }
        }

        return null;
    }

    /**
     * Add support for new entity type
     */
    addSupportedEntity(entity) {
        if (!this.supportedEntities.includes(entity)) {
            this.supportedEntities.push(entity);
            console.log(`Added support for entity: ${entity}`);
        }
    }
    getConnectedClientsCount() {
        return this.connectedClients.size;
    }

    /**
     * Get all connected clients info
     */
    getConnectedClientsInfo() {
        return Array.from(this.connectedClients.values()).map(client => ({
            ...client,
            subscriptions: Array.from(client.subscriptions)
        }));
    }

    /**
     * Check if user is connected
     */
    isUserConnected(userId) {
        return Array.from(this.connectedClients.values())
            .some(client => client.userId === userId);
    }

    /**
     * Get user subscriptions
     */
    getUserSubscriptions(userId) {
        const clients = Array.from(this.connectedClients.values())
            .filter(client => client.userId === userId);

        const allSubscriptions = new Set();
        clients.forEach(client => {
            client.subscriptions.forEach(sub => allSubscriptions.add(sub));
        });

        return Array.from(allSubscriptions);
    }

    /**
     * Disconnect specific user
     */
    disconnectUser(userId, reason = 'Server initiated disconnect') {
        if (!this.io) return;

        const sockets = this.io.sockets.sockets;
        sockets.forEach(socket => {
            if (socket.userId === userId) {
                socket.emit('force_disconnect', { reason });
                socket.disconnect(true);
            }
        });
    }

    /**
     * Graceful shutdown
     */
    async shutdown() {
        this.isShuttingDown = true;
        console.log('Initiating WebSocket service shutdown...');

        if (this.io) {
            // Notify all clients
            this.io.emit('server_shutdown', {
                message: 'Server is shutting down',
                timestamp: new Date().toISOString()
            });

            // Disconnect all clients
            const sockets = await this.io.fetchSockets();
            sockets.forEach(socket => socket.disconnect(true));

            // Close server
            this.io.close();
        }

        this.connectedClients.clear();
        this.eventRateLimits.clear();

        console.log('WebSocket service shutdown complete');
    }

    /**
     * Health check
     */
    healthCheck() {
        return {
            status: this.io ? 'healthy' : 'not_initialized',
            connectedClients: this.connectedClients.size,
            isShuttingDown: this.isShuttingDown,
            supportedEntities: this.supportedEntities,
            uptime: process.uptime()
        };
    }
}


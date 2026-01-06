# Authentication API Documentation

This module provides JWT-based authentication with token family tracking, refresh with grace period, and active session management. All endpoints use JSON for request and response bodies.

## Base URL

- Recommended mount path: `/api/auth` (examples assume this path).
- All protected routes require a valid `Authorization: Bearer <token>` header.

## Response Format

All successful responses use a common envelope:

```json
{
  "success": true,
  "message": "Human readable message",
  "data": {},
  "statusCode": 200
}
```

All errors are thrown using a central `AppError` class and should be serialized consistently by your global error handler, typically as:

```json
{
  "success": false,
  "message": "Error message",
  "code": "ERROR_CODE",
  "details": [],
  "statusCode": 400
}
```

---

## Authentication Endpoints

### Register Member

**URL:** `POST /api/auth/register`  
**Auth:** Required – caller must be authenticated and authorized with an allowed role (`authenticate` + `authorize(process.env.ALLOWED_ROLES)`).

#### Request Body

```json
{
  "memberName": "John Doe",
  "memberContact": "+91-9876543210",
  "email": "john.doe@example.com",
  "password": "StrongP@ssw0rd",
  "designationId": 24,
  "isRecruiter": false,
  "isInterviewer": false,
  "vendorId": 2
}
```

- `designation` is a human-readable value that is transformed to an internal `lookupKey` before persistence.
- Password must be at least 8 characters and contain uppercase, lowercase, number and special character.

#### Success Response `201`

```json
{
  "success": true,
  "message": "Registration successful",
  "statusCode": 201,
  "data": {
    "member": {
      "memberId": 1,
      "memberName": "John Doe",
      "memberContact": "+91-9876543210",
      "email": "john.doe@example.com",
      "designation": "Senior Developer",
      "isRecruiter": false,
      "isInterviewer": false,
      "isActive": true,
      "lastLogin": null,
      "createdAt": "2025-01-01T10:00:00.000Z",
      "updatedAt": "2025-01-01T10:00:00.000Z"
    }
  }
}
```

#### Possible Error Codes

- `EMAIL_EXISTS` – email already registered.
- `VALIDATION_ERROR` – invalid body fields.

---

### Login

**URL:** `POST /api/auth/login`  
**Auth:** Public  
**Middlewares:** `loginRateLimiter`, `AuthValidator.validateLogin`.

#### Request Body

```json
{
  "email": "john.doe@example.com",
  "password": "StrongP@ssw0rd"
}
```

#### Success Response `200`

```json
{
  "success": true,
  "message": "Login successful",
  "statusCode": 200,
  "data": {
    "member": {
      "memberId": 1,
      "memberName": "John Doe",
      "email": "john.doe@example.com",
      "designation": "Senior Developer",
      "isRecruiter": false
    },
    "token": "<jwt-access-token>",
    "expiresIn": "15m"
  }
}
```

- `token` is a signed JWT containing `memberId`, `email`, `jti`, `family`, and `type: "access"`.
- A record is stored in `active_token` with JTI, token family, user agent, IP and expiry for revocation and session tracking.

#### Possible Error Codes

- `INVALID_CREDENTIALS` – email not found or wrong password.
- `ACCOUNT_INACTIVE` – member exists but is inactive.
- `VALIDATION_ERROR` – invalid body.

---

### Change Password

**URL:** `POST /api/auth/change-password`  
**Auth:** Required – authenticated user (`authenticate`).
**Middlewares:** `AuthValidator.validateResetPassword`.

#### Request Body

```json
{
  "currentPassword": "OldP@ssw0rd",
  "newPassword": "NewStr0ngP@ss"
}
```

- `newPassword` must be at least 8 chars, max 128, and must differ from `currentPassword` with required complexity.

#### Success Response `200`

```json
{
  "success": true,
  "message": "Password changed successfully",
  "statusCode": 200,
  "data": null
}
```

- All existing tokens for the member are revoked (`logout from all devices`).

#### Possible Error Codes

- `INVALID_CURRENT_PASSWORD` – current password does not match.
- `VALIDATION_ERROR` – invalid body.

---

### Refresh Token

**URL:** `POST /api/auth/refresh`  
**Auth:** Required – provide existing (possibly expired) token in `Authorization` header.
**Middlewares:** `refreshRateLimiter`.

#### Headers

```text
Authorization: Bearer <jwt-access-token>
User-Agent: <client user agent>   // optional
```

#### Request Body

Empty body.

#### Success Response `200`

```json
{
  "success": true,
  "message": "Token refreshed successfully",
  "statusCode": 200,
  "data": {
    "token": "<new-jwt-access-token>",
    "expiresIn": "15m"
  }
}
```

- The old token’s JTI is revoked.
- A new token with the same token family is generated and stored in `active_token`.

#### Possible Error Codes

- `TOKEN_MISSING` – missing or invalid `Authorization` header format.
- `INVALID_TOKEN` – invalid structure or signature.
- `TOKEN_TOO_OLD` – token age exceeds configured `refreshGracePeriod`.
- `TOKEN_REVOKED` – token or token family revoked.
- `INVALID_MEMBER` – member not found or inactive.

---

### Logout (Current Device)

**URL:** `POST /api/auth/logout`  
**Auth:** Token recommended – `Authorization: Bearer <jwt-access-token>`.[1]

#### Headers

```text
Authorization: Bearer <jwt-access-token>
```

#### Request Body

Empty body.

#### Success Response `200`

```json
{
  "success": true,
  "message": "Logout successful",
  "statusCode": 200,
  "data": null
}
```

- If a valid token is provided, its JTI is marked revoked in `active_token`.
- Logout always returns success, even if token is invalid or missing.

---

### Logout From All Devices

**URL:** `POST /api/auth/logout-all`  
**Auth:** Required – authenticated user (`authenticate`).

#### Request Body

Empty body.

#### Success Response `200`

```json
{
  "success": true,
  "message": "Logged out from all devices successfully",
  "statusCode": 200,
  "data": null
}
```

- All active tokens for the authenticated member are marked revoked.

---

### Get Active Sessions

**URL:** `GET /api/auth/sessions`  
**Auth:** Required – authenticated user (`authenticate`).

#### Success Response `200`

```json
{
  "success": true,
  "message": "Active sessions retrieved successfully",
  "statusCode": 200,
  "data": {
    "sessions": [
      {
        "id": 10,
        "jti": "c7b5c5fd-8b0e-4f27-9c1b-8ad0f1c3a1ef",
        "userAgent": "Mozilla/5.0 ...",
        "ipAddress": "192.168.1.10",
        "createdAt": "2025-01-01T10:00:00.000Z",
        "expiresAt": "2025-01-01T10:15:00.000Z",
        "tokenFamily": "2e4fe47c-0c9e-4af0-97aa-5a4f91e83b9f"
      }
    ]
  }
}
```

- Only non-revoked tokens with `expiresAt > NOW()` are returned.

---

### Get Profile (Current User)

**URL:** `GET /api/auth/profile`  
**Auth:** Required – authenticated user (`authenticate`).

#### Success Response `200`

```json
{
  "success": true,
  "message": "Profile retrieved successfully",
  "statusCode": 200,
  "data": {
    "member": {
      "memberId": 1,
      "memberName": "John Doe",
      "memberContact": "+91-9876543210",
      "email": "john.doe@example.com",
      "designation": "Senior Developer",
      "isRecruiter": false,
      "isInterviewer": false,
      "isActive": true,
      "lastLogin": "2025-01-01T10:00:00.000Z",
      "createdAt": "2025-01-01T09:00:00.000Z",
      "updatedAt": "2025-01-01T09:00:00.000Z"
    }
  }
}
```

- Data is taken from `req.user`, which is populated by the authentication middleware after token verification.

---

## Token Structure & Security

- Algorithm, secret, expiry and issuer/audience are configured in `jwtConfig.token` (e.g. `expiresIn`, `issuer`, `audience`, `algorithm`).
- Each token includes:
  - `sub` / `memberId`
  - `email`
  - `jti` (unique token ID)
  - `family` (token family UUID)
  - `type: "access"`
  - `iat` (issued at)

On each authenticated request, the middleware:

1. Verifies the JWT signature and expiration.
2. Checks `active_token.isRevoked` for the corresponding JTI.
3. Throws `TOKEN_REVOKED`, `TOKEN_EXPIRED`, or `INVALID_TOKEN` via `AppError` if invalid.

# Client API Endpoints

This document describes the RESTful API endpoints for Aerolens Backend

---

## Endpoints

### GET `/client`

Retrieve a list of clients.

#### Response

- `data`: Array of client objects with the following fields:
  - `clientId` (integer)
  - `clientName` (string)
  - `address` (string)
  - `location` (geospatial data)

#### Example Request

GET /

### Response

{
"success": true,
"message": "Clients retrieved successfully",
"data": [
{
"clientId": 2,
"clientName": "Intuit Bangalore Headquarters",
"address": "12 Park Street, Bangalore, Karnataka 560001",
"location": {
"x": 77.590082,
"y": 12.9767936
}
},
{
"clientId": 4,
"clientName": "Google ( Alphabet ) Test",
"address": "1600 Amphitheatre Parkway, Mountain View, CA 94043, USA",
"location": {
"x": -122.0855846,
"y": 37.4224857
}
},
{
"clientId": 13,
"clientName": "IBM Company",
"address": "1 New Orchard Rd, Armonk, NY 10504, USA",
"location": {
"x": -73.720356,
"y": 41.1134016
}
},
{
"clientId": 15,
"clientName": "Microsoft",
"address": "10000 NE 8th St, Bellevue, WA 98004, USA",
"location": {
"x": -122.206902,
"y": 47.617524
}
},
{
"clientId": 16,
"clientName": "Apple Inc.",
"address": "One Apple Park Way, Cupertino, CA 95014, USA",
"location": {
"x": -122.0126936,
"y": 37.3349372
}
},
{
"clientId": 17,
"clientName": "Amazon",
"address": "410 Terry Ave N, Seattle, WA 98109, USA",
"location": {
"x": -122.3365001,
"y": 47.622298
}
}
]
}

---

## Get All Clients with Departments

### Example Request

/client/all

### Response

{
"success": true,
"message": "Clients with departments retrieved successfully",
"data": {
"clientData": [
{
"clientId": 17,
"clientName": "Amazon",
"departments": []
},
{
"clientId": 122,
"clientName": "Amazon Web Services",
"departments": []
},
{
"clientId": 16,
"clientName": "Apple Inc.",
"departments": []
},
{
"clientId": 64,
"clientName": "Boston Airport 2Testing",
"departments": []
},
{
"clientId": 123,
"clientName": "FoundersPodcast",
"departments": []
},
{
"clientId": 4,
"clientName": "Google ( Alphabet ) Test",
"departments": [
{
"departmentId": 83,
"departmentName": "check"
},
{
"departmentId": 71,
"departmentName": "Marketinghj"
}
]
},
{
"clientId": 13,
"clientName": "IBM Company",
"departments": [
{
"departmentId": 90,
"departmentName": "AI & Data Science"
},
{
"departmentId": 73,
"departmentName": "Consulting"
},
{
"departmentId": 89,
"departmentName": "Finance"
},
{
"departmentId": 88,
"departmentName": "IT & Security"
},
{
"departmentId": 87,
"departmentName": "Product Infrastructure"
},
{
"departmentId": 72,
"departmentName": "Software"
}
]
},
{
"clientId": 2,
"clientName": "Intuit Bangalore Headquarters",
"departments": [
{
"departmentId": 86,
"departmentName": "DevOps and AIOps"
}
]
},
{
"clientId": 15,
"clientName": "Microsoft",
"departments": [
{
"departmentId": 74,
"departmentName": "Cloud and AI Grouptwo"
},
{
"departmentId": 75,
"departmentName": "Experiences and Devices"
}
]
},
{
"clientId": 48,
"clientName": "Ramp",
"departments": []
},
{
"clientId": 65,
"clientName": "TCS",
"departments": []
},
{
"clientId": 69,
"clientName": "Tesla",
"departments": []
}
],
"locationData": [
{
"city": "Ahmedabad",
"state": "Gujarat",
"country": "India"
},
{
"city": "Bangalore",
"state": "Karnataka",
"country": "India"
},
{
"city": "Mountain View",
"state": "California",
"country": "United States"
},
{
"city": "San Francisco",
"state": "California",
"country": "United States"
}
]
}
}

## Create Client

**Endpoint:** `POST /client`

Create a new client record with geocoded location.

### Request

JSON Body:

| Field     | Type   | Required | Description                            |
| --------- | ------ | -------- | -------------------------------------- |
| `name`    | String | Yes      | The client's name (max length: 255)    |
| `address` | String | Yes      | The client's address (max length: 500) |

**Example:**
{
"name": "Acme Corp",
"address": "123 Main St, Springfield"
}

### Response

- **Success (201 Created):**

{
"success": true,
"message": "Client details posted successfully",
"data": {
"clientName": "Acme Corp",
"address": "123 Main St, Springfield",
"location": {
"lat": 32.7767,
"lon": -96.7970,
"source": "geocoding_api"
}
}
}

- **Validation Error (400 Bad Request):**

{
"success": false,
"error": "VALIDATION_ERROR",
"message": "Name and address are required fields",
"details": {
"missingFields": ["name"]
}
}

- **Geocoding Error (422 Unprocessable Entity):**

{
"success": false,
"error": "GEOCODING_ERROR",
"message": "Unable to find location for the provided address",
"details": {
"address": "123 Main St, Springfield",
"geocodeError": "No results found",
"suggestion": "Please verify the address format and try again"
}
}

- **Duplicate Entry (409 Conflict):**

{
"success": false,
"error": "DUPLICATE_ENTRY",
"message": "A client with this information already exists",
"details": {
"duplicateField": "name"
}
}

- **Data Too Long (400 Bad Request):**

{
"success": false,
"error": "DATA_TOO_LONG",
"message": "One or more fields exceed the maximum allowed length",
"details": {
"field": "address"
}
}

- **Internal/Database Error (500):**

General database or server errors with details.

---

## Update Client

**Endpoint:** `PATCH /client/:id`

Update an existing client's name or address. If the address changes, its location will be re-geocoded.

### Request

Path Parameters:

| Parameter | Type   | Required | Description      |
| --------- | ------ | -------- | ---------------- |
| `id`      | Number | Yes      | Unique client ID |

JSON Body:

| Field     | Type   | Required | Description                                  |
| --------- | ------ | -------- | -------------------------------------------- |
| `name`    | String | No       | New name for the client (max length: 255)    |
| `address` | String | No       | New address for the client (max length: 500) |

**At least one of** `name` or `address` must be provided.

**Example:**

{
"name": "Acme Corp International",
"address": "456 Market St, Springfield"
}

### Response

- **Success (200 OK):**

{
"success": true,
"message": "Client details updated successfully",
"data": {
"clientId": 9,
"updatedFields": {
"name": "Acme Corp International",
"address": "456 Market St, Springfield",
"location": {
"lat": 32.7788,
"lon": -96.7999,
"source": "geocoding_api"
}
},
"previousValues": {
"name": "Acme Corp",
"address": "123 Main St, Springfield"
}
}
}

- **Validation Error (400 Bad Request):**

  - Missing client ID:

{
"success": false,
"error": "VALIDATION_ERROR",
"message": "Client ID is required for update operation",
"details": {
"missingFields": ["id"]
}
}

- Invalid client ID format:

{
"success": false,
"error": "VALIDATION_ERROR",
"message": "Invalid client ID format",
"details": {
"providedId": "abc",
"expectedFormat": "numeric"
}
}

- No fields for update:

{
"success": false,
"error": "VALIDATION_ERROR",
"message": "At least one field (name or address) must be provided for update",
"details": {
"allowedFields": ["name", "address"]
}
}

- Name too long:

{
"success": false,
"error": "VALIDATION_ERROR",
"message": "Client name exceeds maximum allowed length",
"details": {
"field": "name",
"maxLength": 255,
"providedLength": 300
}
}

- Address too long:

{
"success": false,
"error": "VALIDATION_ERROR",
"message": "Address exceeds maximum allowed length",
"details": {
"field": "address",
"maxLength": 500,
"providedLength": 800
}
}

- **Geocoding Error (422 Unprocessable Entity):**

{
"success": false,
"error": "GEOCODING_ERROR",
"message": "Unable to find location for the new address",
"details": {
"newAddress": "456 Market St, Springfield",
"oldAddress": "123 Main St, Springfield",
"geocodeError": "Bad address",
"suggestion": "Please verify the new address format or keep the existing address"
}
}

- **Client Not Found (404 Not Found):**

{
"success": false,
"error": "CLIENT_NOT_FOUND",
"message": "Client with ID 9 does not exist",
"details": {
"clientId": 9,
"suggestion": "Please verify the client ID and try again"
}
}

- **Update Failed (404 Not Found):**

{
"success": false,
"error": "UPDATE_FAILED",
"message": "No changes were made to the client record",
"details": {
"clientId": 9,
"reason": "Client may have been deleted by another process"
}
}

- **Duplicate Entry (409 Conflict):**

{
"success": false,
"error": "DUPLICATE_ENTRY",
"message": "A client with this information already exists",
"details": {
"conflictingField": "name"
}
}

- **Data Too Long (400 Bad Request):**

{
"success": false,
"error": "DATA_TOO_LONG",
"message": "One or more fields exceed the maximum allowed length",
"details": {
"error": "Detailed error message"
}
}

- **Null Constraint Violation (400 Bad Request):**

{
"success": false,
"error": "NULL_CONSTRAINT_VIOLATION",
"message": "Required field cannot be null",
"details": {
"field": "name"
}
}

- **Database/Internal Error (500):**

General database or server errors with details.

---

### DELETE `/client/:id`

Delete a client by ID.

#### Path Parameter

- `id` (integer, required) - ID of the client to delete.

#### Behavior

- Deletes client record if it exists.
- Returns error if client not found.
- Validates ID parameter.

#### Response

- HTTP 200 OK with success message.
- HTTP 400 Bad Request for invalid ID.
- HTTP 404 Not Found if client does not exist.

#### Example Request

DELETE /client/3

---

## Error Handling

- All endpoints respond with HTTP 500 Internal Server Error on server-side failures.
- Error messages provide context for failures during database transactions or geocoding.

---

## Notes

- Geocoding is performed asynchronously via the `geocodeAddress()` function (assumed external).
- Location is stored as a `POINT` type in spatial reference system EPSG:4326.
- Transactions are used to ensure data consistency during create, update, and delete operations.

---

## Get Client Details

**Endpoint:** `GET /:id`

Retrieve detailed information about a client, including departments and client contacts.

### Request

Path Parameters:

| Parameter | Type   | Required | Description                         |
| --------- | ------ | -------- | ----------------------------------- |
| `id`      | Number | Yes      | The unique numeric ID of the client |

### Response

- **Success (200 OK)**
  {
  "success": true,
  "message": "Client retrieved successfully",
  "data": {
  "clientId": 2,
  "clientName": "Intuit Bangalore Headquarters",
  "address": "12 Park Street, Bangalore, Karnataka 560001",
  "location": {
  "x": 77.590082,
  "y": 12.9767936
  },
  "departments": [
  {
  "departmentId": 86,
  "departmentName": "DevOps and AIOps",
  "departmentDescription": "Teams responsible for operational automation, continuous integration/deployment, and monitoring of Intuit's cloud infrastructure."
  }
  ],
  "clientContact": [
  {
  "email": "palash@testing.com",
  "phone": "9876500322",
  "designation": "SDE",
  "clientContactId": 23,
  "contactPersonName": "Palash Acharya"
  },
  {
  "email": "aksh@testing.com",
  "phone": "9876500322",
  "designation": "Senior Manager",
  "clientContactId": 32,
  "contactPersonName": "Aksh Patel"
  }
  ]
  }
  }

- **Validation Errors (400 Bad Request)**

  - Missing `id`:

{
"success": false,
"error": "VALIDATION_ERROR",
"message": "Client ID is required",
"details": {
"parameter": "id",
"location": "path"
}
}

- Invalid `id` format:

{
"success": false,
"error": "VALIDATION_ERROR",
"message": "Invalid client ID format",
"details": {
"providedId": "abc",
"expectedFormat": "numeric",
"example": "/api/client/123"
}
}

- **Not Found (404 Not Found)**

{
"success": false,
"error": "CLIENT_NOT_FOUND",
"message": "Client with ID 123 not found",
"details": {
"clientId": "123",
"suggestion": "Please verify the client ID and try again",
"searchHint": "You can search for clients using the list endpoint"
}
}

- **Server Errors (500, 503)**

Detailed error responses for database or unexpected errors.

---

## Create Department

**Endpoint:** `POST /department`

Creates a new department for a client.

### Request

JSON Body:

| Field                   | Type   | Required | Description                   |
| ----------------------- | ------ | -------- | ----------------------------- |
| `clientId`              | Number | Yes      | The client's ID               |
| `departmentName`        | String | Yes      | Name of the department        |
| `departmentDescription` | String | Yes      | Description of the department |

Example:

{
"clientId": 123,
"departmentName": "Finance",
"departmentDescription": "Handles financial matters"
}

### Response

- **Success (201 Created)**

{
"success": true,
"message": "Department details posted successfully",
"data": {
"departmentName": "Finance",
"departmentDescription": "Handles financial matters",
"clientId": 123
}
}

- **Validation Error (400 Bad Request)**

{
"success": false,
"error": "VALIDATION_ERROR",
"message": "departmentName, departmentDescription and clientId are required fields",
"details": {
"missingFields": ["clientId", "departmentDescription"]
}
}

- **Duplicate Entry (409 Conflict)**

{
"success": false,
"error": "DUPLICATE_ENTRY",
"message": "A department with this information already exists",
"details": {
"duplicateField": "unknown"
}
}

- **Data Too Long (400 Bad Request)**

{
"success": false,
"error": "DATA_TOO_LONG",
"message": "One or more fields exceed the maximum allowed length",
"details": {
"field": "..."
}
}

- **Server Errors (500)**

General database or internal server errors.

---

## Update Department Details

**Endpoint:** `PATCH /department/:departmentId`

Update information for an existing department.

### Request

Path Parameters:

| Parameter      | Type   | Required | Description          |
| -------------- | ------ | -------- | -------------------- |
| `departmentId` | Number | Yes      | Unique department ID |

JSON Body:

| Field                   | Type   | Required | Description                                  |
| ----------------------- | ------ | -------- | -------------------------------------------- |
| `departmentName`        | String | No       | New name of the department (max length: 100) |
| `departmentDescription` | String | No       | New description of the department            |

At least one of `departmentName` or `departmentDescription` must be provided.

**Example Request:**
{
"departmentName": "Technology",
"departmentDescription": "Handles all tech-related operations"
}

### Response

- **Success (200 OK):**

{
"success": true,
"message": "department details updated successfully",
"data": {
"departmentId": 101,
"updatedFields": {
"departmentName": "Technology",
"departmentDescription": "Handles all tech-related operations"
},
"previousValues": {
"departmentName": "IT",
"description": "Information Technology department"
}
}
}

- **Validation Errors (400 Bad Request):**

  - Missing `departmentId`:

{
"success": false,
"error": "VALIDATION_ERROR",
"message": "department ID is required for update operation",
"details": {
"missingFields": ["departmentId"]
}
}

- Invalid `departmentId` format:

{
"success": false,
"error": "VALIDATION_ERROR",
"message": "Invalid Department ID format",
"details": {
"providedId": "abc",
"expectedFormat": "numeric"
}
}

- No fields provided for update:

{
"success": false,
"error": "VALIDATION_ERROR",
"message": "At least one field (departmentName or departmentDescription) must be provided for update",
"details": {
"allowedFields": ["departmentName", "departmentDescription"]
}
}

- Department name too long:

{
"success": false,
"error": "VALIDATION_ERROR",
"message": "Department name exceeds maximum allowed length",
"details": {
"field": "departmentName",
"maxLength": 100,
"providedLength": 120
}
}

- **Not Found (404 Not Found):**

{
"success": false,
"error": "CONTACT_NOT_FOUND",
"message": "Contact with ID 101 does not exist",
"details": {
"departmentId": 101,
"suggestion": "Please verify the department ID and try again"
}
}

- **Conflict (409 Conflict):**

{
"success": false,
"error": "DUPLICATE_ENTRY",
"message": "A department with this information already exists",
"details": {
"conflictingField": "departmentName",
"suggestion": "Please use a different department name or check for existing departments"
}
}

- **Data Too Long (400 Bad Request):**

{
"success": false,
"error": "DATA_TOO_LONG",
"message": "One or more fields exceed the maximum allowed length",
"details": {
"error": "Detailed error message"
}
}

- **Null Constraint Violation (400 Bad Request):**

{
"success": false,
"error": "NULL_CONSTRAINT_VIOLATION",
"message": "Required field cannot be null",
"details": {
"field": "departmentDescription"
}
}

- **Update Failed (404 Not Found):**

{
"success": false,
"error": "UPDATE_FAILED",
"message": "No changes were made to the department record",
"details": {
"departmentId": 101,
"reason": "department may have been deleted by another process"
}
}

- **Internal Server Error (500):**

{
"success": false,
"error": "DATABASE_ERROR",
"message": "Failed to update department details",
"details": {
"operation": "UPDATE",
"code": "ER_CODE",
"sqlState": "SQL_STATE"
}
}

## Delete Department

**Endpoint:** `DELETE /department/:id`

Deletes a department by its unique ID.

### Request

Path Parameters:

| Parameter | Type   | Required | Description                     |
| --------- | ------ | -------- | ------------------------------- |
| `id`      | Number | Yes      | The unique ID of the department |

### Response

- **Success (200 OK):**
  {
  "message": "department deleted successfully"
  }

- **Validation Error (400 Bad Request):**

When the provided department ID is missing or invalid:

{
"message": "Invalid Department ID"
}

- **Not Found (404 Not Found):**

If no department exists for the given ID:

{
"message": "department not found"
}

- **Internal Server Error (500):**

If a server/database error occurs during deletion:

{
"message": "Internal server error during Department deletion"
}

## Notes

- All responses are in JSON format.
- Input validation is strict for required fields.
- Errors provide detailed information for easier troubleshooting.
- Database connection handling includes transactions for the POST endpoint.
- The `id` must be numeric and valid for GET requests.

---

This README provides a comprehensive overview for developers to use the client API endpoints effectively.

# Contact API

API endpoints for managing client contacts.

---

## Create Contact

**Endpoint:** `POST /contact`

Creates a new contact for an existing client.

### Request

JSON body:

| Field               | Type   | Required | Description                  |
| ------------------- | ------ | -------- | ---------------------------- |
| `clientId`          | Number | Yes      | The client's ID              |
| `contactPersonName` | String | Yes      | Contact person's name        |
| `designation`       | String | Yes      | Contact person's designation |
| `phone`             | String | No       | Contact person's phone       |
| `email`             | String | No       | Contact person's email       |

**Example:**

{
"clientId": 123,
"contactPersonName": "John Doe",
"designation": "Manager",
"phone": "9876543210",
"email": "john@example.com"
}

### Response

- **Success (201 Created):**

{
"success": true,
"message": "client contact details posted successfully",
"data": {
"contactPersonName": "John Doe",
"designation": "Manager",
"phone": "9876543210",
"email": "john@example.com",
"clientId": 123
}
}

- **Validation Error (400 Bad Request):**

{
"success": false,
"error": "VALIDATION_ERROR",
"message": "contactPersonName, designation, phone, email and clientId are required fields",
"details": {
"missingFields": ["clientId"]
}
}

- **Duplicate Entry (409 Conflict):**

{
"success": false,
"error": "DUPLICATE_ENTRY",
"message": "A client contact with this information already exists",
"details": {
"duplicateField": "unknown"
}
}

- **Data Too Long (400 Bad Request):**

{
"success": false,
"error": "DATA_TOO_LONG",
"message": "One or more fields exceed the maximum allowed length",
"details": {
"field": "..."
}
}

- **Database/Internal Errors (500):**

General database or internal server errors with detailed information.

---

## Update Contact

**Endpoint:** `PATCH /contact/:contactId`

Update details of an existing client contact.

### Request

Path Parameters:

| Parameter   | Type   | Required | Description              |
| ----------- | ------ | -------- | ------------------------ |
| `contactId` | Number | Yes      | Unique contact person ID |

JSON body:

| Field               | Type   | Required | Description                          |
| ------------------- | ------ | -------- | ------------------------------------ |
| `contactPersonName` | String | No       | Updated contact person's name        |
| `designation`       | String | No       | Updated contact person's designation |
| `phone`             | String | No       | Updated contact person's phone       |
| `email`             | String | No       | Updated contact person's email       |

**At least one of** `contactPersonName`, `designation`, `phone`, or `email` must be provided for updates.

**Example:**

{
"phone": "9998887776"
}

### Response

- **Success (200 OK):**

{
"success": true,
"message": "clientContact details updated successfully",
"data": {
"clientId": 42,
"updatedFields": {
"phone": "9998887776"
},
"previousValues": {
"phone": "9876543210"
}
}
}

- **Validation Error (400 Bad Request):**

  - Missing contactId:

{
"success": false,
"error": "VALIDATION_ERROR",
"message": "contact ID is required for update operation",
"details": {
"missingFields": ["contactId"]
}
}

- Invalid contactId format:

{
"success": false,
"error": "VALIDATION_ERROR",
"message": "Invalid contact ID format",
"details": {
"providedId": "abc",
"expectedFormat": "numeric"
}
}

- No fields for update:

{
"success": false,
"error": "VALIDATION_ERROR",
"message": "At least one field (contactPersonName, designation, phone, or email) must be provided for update",
"details": {
"allowedFields": ["contactPersonName", "designation", "phone", "email"]
}
}

- Field length errors:

{
"success": false,
"error": "VALIDATION_ERROR",
"message": "Contact name exceeds maximum allowed length",
"details": {
"field": "contactPersonName",
"maxLength": 100,
"providedLength": 120
}
}

- **Contact Not Found (404 Not Found):**

{
"success": false,
"error": "CONTACT_NOT_FOUND",
"message": "Contact with ID 42 does not exist",
"details": {
"clientId": 42,
"suggestion": "Please verify the contact ID and try again"
}
}

- **Duplicate Entry (409 Conflict):**

{
"success": false,
"error": "DUPLICATE_ENTRY",
"message": "A clientContact with this information already exists",
"details": {
"conflictingField": "contactPersonName",
"suggestion": "Please use a different name or check for existing client contacts"
}
}

- **Other Database/Internal Errors (500):**

General database or internal server errors with details.

---

## Delete client contact

**Endpoint:** `DELETE /contact/:contactId`

Deletes a department by its unique ID.

### Request

Path Parameters:

| Parameter   | Type   | Required | Description                         |
| ----------- | ------ | -------- | ----------------------------------- |
| `contactId` | Number | Yes      | The unique ID of the contact person |

### Response

- **Success (200 OK):**
  {
  "message": "client contact deleted successfully"
  }

- **Validation Error (400 Bad Request):**

When the provided contact person ID is missing or invalid:

{
"message": "Invalid Contact Person ID"
}

- **Not Found (404 Not Found):**

If no contact person exists for the given ID:

{
"message": "client contact not found"
}

- **Internal Server Error (500):**

If a server/database error occurs during deletion:

{
"message": "Internal server error during client contact deletion"
}

# Job Profile API Documentation

## Overview

The Job Profile API provides endpoints for managing job profiles, including creating, updating, retrieving, and deleting job profiles, as well as managing job description (JD) file uploads.

## Base URL

```
/api/jobProfile
```

## Authentication

All endpoints require authentication via the `authenticate` middleware. Include authentication token in the request headers.

---

## Endpoints

### 1. Get All Job Profiles

Retrieves all job profiles in the system.

**Endpoint:** `GET /`

**Request Headers:**

```json
{
  "Authorization": "Bearer <token>"
}
```

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Job Profiles retrieved successfully",
  "data": [
    {
      "jobProfileId": 1,
      "clientName": "Tech Corp",
      "departmentName": "Engineering",
      "jobProfileDescription": "Senior software engineer position",
      "jobRole": "Senior Software Engineer",
      "techSpecification": "React, Node.js, MongoDB",
      "positions": 3,
      "receivedOn": "2024-01-15",
      "estimatedCloseDate": "2024-03-15",
      "workArrangement": "hybrid",
      "location": {
        "country": "india",
        "city": "Bangalore"
      },
      "status": "in progress",
      "jdFileName": "jd-descriptions/jobProfile_1_1234567890.pdf",
      "jdOriginalName": "Senior_Engineer_JD.pdf",
      "jdUploadDate": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

---

### 2. Get Job Profile by ID

Retrieves a specific job profile by its ID.

**Endpoint:** `GET /:id`

**URL Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | integer | Job profile ID (positive integer) |

**Request Headers:**

```json
{
  "Authorization": "Bearer <token>"
}
```

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Job Profile retrieved successfully",
  "data": {
    "jobProfileId": 1,
    "clientId": 10,
    "clientName": "Tech Corp",
    "departmentName": "Engineering",
    "jobProfileDescription": "Senior software engineer position",
    "jobRole": "Senior Software Engineer",
    "techSpecification": "React, Node.js, MongoDB",
    "positions": 3,
    "receivedOn": "2024-01-15",
    "estimatedCloseDate": "2024-03-15",
    "workArrangement": "hybrid",
    "location": {
      "country": "india",
      "city": "Bangalore"
    },
    "status": "in progress",
    "jdFileName": "jd-descriptions/jobProfile_1_1234567890.pdf",
    "jdOriginalName": "Senior_Engineer_JD.pdf",
    "jdUploadDate": "2024-01-15T10:30:00.000Z"
  }
}
```

**Error Response:** `404 Not Found`

```json
{
  "success": false,
  "message": "Job profile with ID 1 not found",
  "errorCode": "JOB_PROFILE_NOT_FOUND"
}
```

---

### 3. Create Job Profile

Creates a new job profile with optional JD file upload.

**Endpoint:** `POST /`

**Request Headers:**

```json
{
  "Authorization": "Bearer <token>",
  "Content-Type": "multipart/form-data"
}
```

**Request Body (multipart/form-data):**

| Field                 | Type    | Required | Description                                                                  |
| --------------------- | ------- | -------- | ---------------------------------------------------------------------------- |
| clientId              | integer | Yes      | Client ID (positive integer)                                                 |
| departmentId          | integer | Yes      | Department ID (positive integer)                                             |
| jobProfileDescription | string  | Yes      | Job description (10-500 characters)                                          |
| jobRole               | string  | Yes      | Job role title (2-100 characters)                                            |
| techSpecification     | string  | Yes      | Comma-separated technologies (e.g., "React, Node.js")                        |
| positions             | integer | Yes      | Number of open positions (positive integer)                                  |
| estimatedCloseDate    | string  | Yes      | Close date in YYYY-MM-DD format (cannot be in past)                          |
| workArrangement       | string  | Yes      | One of: `remote`, `onsite`, `hybrid`                                         |
| location              | string  | Yes      | JSON string: `{"country": "india", "city": "Bangalore"}`                     |
| status                | string  | No       | One of: `pending`, `in progress`, `closed`, `cancelled` (default: `pending`) |
| JD                    | file    | No       | Job description file (PDF, DOC, DOCX; max 5MB)                               |

**Example Request Body:**

```
clientId=10
departmentId=5
jobProfileDescription=We are looking for a senior software engineer
jobRole=Senior Software Engineer
techSpecification=React, Node.js, MongoDB
positions=3
estimatedCloseDate=2024-12-31
workArrangement=hybrid
location={"country":"india","city":"Bangalore"}
status=pending
JD=<file>
```

**Response:** `201 Created`

```json
{
  "success": true,
  "message": "Job Profile created successfully",
  "data": {
    "jobProfileId": 1,
    "clientId": 10,
    "departmentId": 5,
    "jobProfileDescription": "We are looking for a senior software engineer",
    "jobRole": "Senior Software Engineer",
    "techSpecification": "React, Node.js, MongoDB",
    "positions": 3,
    "estimatedCloseDate": "2024-12-31",
    "workArrangement": "hybrid",
    "locationId": 15,
    "statusId": 4,
    "receivedOn": "2024-01-15T10:30:00.000Z"
  }
}
```

**Error Response:** `400 Bad Request`

```json
{
  "success": false,
  "message": "Validation failed",
  "errorCode": "VALIDATION_ERROR",
  "details": {
    "validationErrors": [
      {
        "field": "clientId",
        "message": "Client ID is required"
      }
    ]
  }
}
```

**Error Response:** `409 Conflict`

```json
{
  "success": false,
  "message": "A job profile with this role already exists for this client",
  "errorCode": "DUPLICATE_JOB_ROLE"
}
```

---

### 4. Update Job Profile

Updates an existing job profile with optional JD file upload.

**Endpoint:** `PATCH /:id`

**URL Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | integer | Job profile ID (positive integer) |

**Request Headers:**

```json
{
  "Authorization": "Bearer <token>",
  "Content-Type": "multipart/form-data"
}
```

**Request Body (multipart/form-data):**

All fields are optional. Include only the fields you want to update.

| Field                 | Type    | Description                                              |
| --------------------- | ------- | -------------------------------------------------------- |
| jobProfileDescription | string  | Job description (10-500 characters)                      |
| jobRole               | string  | Job role title (2-100 characters)                        |
| techSpecification     | string  | Comma-separated technologies                             |
| positions             | integer | Number of open positions (positive integer)              |
| estimatedCloseDate    | string  | Close date in YYYY-MM-DD format (cannot be in past)      |
| workArrangement       | string  | One of: `remote`, `onsite`, `hybrid`                     |
| location              | string  | JSON string: `{"country": "india", "city": "Bangalore"}` |
| status                | string  | One of: `pending`, `in progress`, `closed`, `cancelled`  |
| JD                    | file    | Job description file (PDF, DOC, DOCX; max 5MB)           |

**Example Request Body:**

```
positions=5
status=in progress
JD=<file>
```

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Job Profile updated successfully",
  "data": {
    "jobProfileId": 1,
    "clientId": 10,
    "clientName": "Tech Corp",
    "departmentName": "Engineering",
    "jobProfileDescription": "Senior software engineer position",
    "jobRole": "Senior Software Engineer",
    "techSpecification": "React, Node.js, MongoDB",
    "positions": 5,
    "receivedOn": "2024-01-15",
    "estimatedCloseDate": "2024-03-15",
    "workArrangement": "hybrid",
    "location": {
      "country": "india",
      "city": "Bangalore"
    },
    "status": "in progress"
  }
}
```

**Error Response:** `400 Bad Request`

```json
{
  "success": false,
  "message": "Cannot update a job profile that is closed",
  "errorCode": "JOB_PROFILE_UPDATE_NOT_ALLOWED"
}
```

**Error Response:** `404 Not Found`

```json
{
  "success": false,
  "message": "Job profile with ID 1 not found",
  "errorCode": "JOB_PROFILE_NOT_FOUND"
}
```

---

### 5. Delete Job Profile

Deletes a job profile by ID.

**Endpoint:** `DELETE /:id`

**URL Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | integer | Job profile ID (positive integer) |

**Request Headers:**

```json
{
  "Authorization": "Bearer <token>"
}
```

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Job Profile deleted successfully",
  "data": null
}
```

**Error Response:** `404 Not Found`

```json
{
  "success": false,
  "message": "Job profile with ID 1 not found",
  "errorCode": "JOB_PROFILE_NOT_FOUND"
}
```

---

## Job Description (JD) File Management

### 6. Upload JD File

Uploads or replaces a JD file for an existing job profile.

**Endpoint:** `POST /:id/upload-JD`

**URL Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | integer | Job profile ID (positive integer) |

**Request Headers:**

```json
{
  "Authorization": "Bearer <token>",
  "Content-Type": "multipart/form-data"
}
```

**Request Body (multipart/form-data):**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| JD | file | Yes | Job description file (PDF, DOC, DOCX; max 5MB) |

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "JD uploaded successfully",
  "data": {
    "jobProfileId": 1,
    "filename": "jd-descriptions/jobProfile_1_1234567890.pdf",
    "originalName": "Senior_Engineer_JD.pdf",
    "size": 245678,
    "location": "https://s3.amazonaws.com/bucket/jd-descriptions/jobProfile_1_1234567890.pdf",
    "uploadDate": "2024-01-15T10:30:00.000Z"
  }
}
```

**Error Response:** `400 Bad Request`

```json
{
  "success": false,
  "message": "No JD file uploaded",
  "errorCode": "NO_FILE_UPLOADED"
}
```

**Error Response:** `400 Bad Request`

```json
{
  "success": false,
  "message": "Invalid JD file type. Only PDF, DOC, and DOCX are allowed.",
  "errorCode": "INVALID_JD_FILE_TYPE"
}
```

---

### 7. Download JD File

Downloads the JD file for a job profile.

**Endpoint:** `GET /:id/get-JD`

**URL Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | integer | Job profile ID (positive integer) |

**Request Headers:**

```json
{
  "Authorization": "Bearer <token>"
}
```

**Response:** `200 OK`

- Returns the file as a downloadable attachment
- Content-Type header set to file's MIME type
- Content-Disposition header set to `attachment; filename="<original_filename>"`

**Error Response:** `404 Not Found`

```json
{
  "success": false,
  "message": "No JD found for this Job Profile",
  "errorCode": "JD_NOT_FOUND"
}
```

---

### 8. Preview JD File

Previews the JD file in the browser (PDF only).

**Endpoint:** `GET /:id/get-JD/preview`

**URL Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | integer | Job profile ID (positive integer) |

**Request Headers:**

```json
{
  "Authorization": "Bearer <token>"
}
```

**Response:** `200 OK`

- Returns the PDF file for inline preview
- Content-Type header set to `application/pdf`
- Content-Disposition header set to `inline; filename="<original_filename>"`

**Error Response:** `400 Bad Request`

```json
{
  "success": false,
  "message": "Preview is only supported for PDF files. Please download the file instead.",
  "errorCode": "PREVIEW_NOT_SUPPORTED",
  "details": {
    "fileType": ".docx",
    "supportedTypes": [".pdf"]
  }
}
```

---

### 9. Get JD File Information

Retrieves metadata about the JD file without downloading it.

**Endpoint:** `GET /:id/JD/info`

**URL Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | integer | Job profile ID (positive integer) |

**Request Headers:**

```json
{
  "Authorization": "Bearer <token>"
}
```

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "JD information retrieved successfully",
  "data": {
    "hasJD": true,
    "originalName": "Senior_Engineer_JD.pdf",
    "uploadDate": "2024-01-15T10:30:00.000Z",
    "s3Key": "jd-descriptions/jobProfile_1_1234567890.pdf",
    "fileExtension": ".pdf",
    "mimeType": "application/pdf",
    "supportsPreview": true
  }
}
```

**Response (No JD):** `200 OK`

```json
{
  "success": true,
  "message": "JD information retrieved successfully",
  "data": {
    "hasJD": false,
    "originalName": null,
    "uploadDate": null,
    "s3Key": null
  }
}
```

---

### 10. Delete JD File

Deletes the JD file from a job profile.

**Endpoint:** `DELETE /:id/delete-JD`

**URL Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | integer | Job profile ID (positive integer) |

**Request Headers:**

```json
{
  "Authorization": "Bearer <token>"
}
```

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "JD deleted successfully",
  "data": {
    "message": "JD deleted successfully",
    "deletedFile": "jd-descriptions/jobProfile_1_1234567890.pdf"
  }
}
```

**Error Response:** `404 Not Found`

```json
{
  "success": false,
  "message": "No JD found for this Job Profile",
  "errorCode": "JD_NOT_FOUND"
}
```

---

### 7. Download JD File

Downloads the JD file for a job profile.

### Job Profile Fields

| Field                 | Type    | Validation                                                        |
| --------------------- | ------- | ----------------------------------------------------------------- |
| clientId              | integer | Required, positive integer                                        |
| departmentId          | integer | Required, positive integer                                        |
| jobProfileDescription | string  | Required, 10-500 characters                                       |
| jobRole               | string  | Required, 2-100 characters, unique per client                     |
| techSpecification     | string  | Required, comma-separated values (min 2 chars each)               |
| positions             | integer | Required, positive integer                                        |
| estimatedCloseDate    | string  | Required, YYYY-MM-DD format, cannot be in past                    |
| workArrangement       | string  | Required, one of: `remote`, `onsite`, `hybrid`                    |
| location              | object  | Required, must contain `country` and `city` fields                |
| location.country      | string  | Required                                                          |
| location.city         | string  | Required, 2-100 characters                                        |
| status                | string  | Optional, one of: `pending`, `in progress`, `closed`, `cancelled` |

### JD File Requirements

- **Allowed formats:** PDF, DOC, DOCX
- **Maximum size:** 5MB
- **Preview support:** PDF only

---

## Common Error Codes

| Error Code                     | HTTP Status | Description                            |
| ------------------------------ | ----------- | -------------------------------------- |
| VALIDATION_ERROR               | 400         | Request validation failed              |
| INVALID_JOB_PROFILE_ID         | 400         | Invalid job profile ID format          |
| DUPLICATE_JOB_ROLE             | 409         | Job role already exists for client     |
| JOB_PROFILE_NOT_FOUND          | 404         | Job profile not found                  |
| JOB_PROFILE_UPDATE_NOT_ALLOWED | 400         | Cannot update closed/cancelled profile |
| INVALID_LOCATION               | 400         | Location does not exist                |
| INVALID_STATUS                 | 400         | Status does not exist                  |
| NO_FILE_UPLOADED               | 400         | JD file was not provided               |
| INVALID_JD_FILE_TYPE           | 400         | Invalid file format for JD             |
| JD_FILE_TOO_LARGE              | 400         | JD file exceeds 5MB limit              |
| JD_NOT_FOUND                   | 404         | No JD file found for job profile       |
| PREVIEW_NOT_SUPPORTED          | 400         | Preview only supported for PDF files   |

---

## Notes

1. All endpoints require authentication
2. Dates are in ISO 8601 format
3. File uploads use multipart/form-data encoding
4. JSON objects in multipart requests must be sent as strings
5. Closed and cancelled job profiles cannot be updated
6. Uploading a new JD file will replace any existing JD file
7. Job roles must be unique per client

# Candidate API CRUD

A structured **Node.js + Express.js API** for managing candidates, with validation, error handling, pagination, searching, and database safety.

---

## Features

- Full **CRUD operations** for candidates
- **Input validation** using Joi
- **Duplicate/constraint handling** and custom error codes
- **Search & filter** with pagination
- **Consistent API response structure**
- **Transaction-safe** updates and deletions
- **Comprehensive schema and data validation**

---

## API Endpoints

## Endpoints and Examples

### Get All Candidates

GET /candidate

**Response:**

```json
{
"success": true,
"message": "Candidates retrieved successfully",
"data": [
{
"candidateId": 38,
"candidateName": "Yash Prajapati",
"contactNumber": "9870654321",
"email": "jaivals21@testing.com",
"recruiterId": null,
"recruiterName": null,
"recruiterContact": null,
"recruiterEmail": null,
"jobRole": "SDE",
"preferredJobLocation":{
"city":"Ahemedabad",
"country":"India"
}
"currentCTC": 23,
"expectedCTC": 33,
"noticePeriod": 30,
"experienceYears": 1,
"linkedinProfileUrl": "https://www.linkedin.com/in/aksh-patel1/",
"createdAt": "2025-09-27T06:09:13.000Z",
"updatedAt": "2025-11-21T05:30:40.000Z",
"statusName": "Pending",
"resumeFilename": "resumes/candidate_38_1763722838929.docx",
"resumeOriginalName": "AICTE_Internship_2024_Project_Report_Template_2.docx",
"resumeUploadDate": "2025-11-21T05:30:40.000Z"
},
{
"candidateId": 40,
"candidateName": "Parth",
"contactNumber": "9898200321",
"email": "parth@gmail.com",
"recruiterId": null,
"recruiterName": null,
"recruiterContact": null,
"recruiterEmail": null,
"jobRole": "Software Devloper",
"preferredJobLocation":{
"city":"Ahemedabad",
"country":"India"
},
"currentCTC": 300,
"expectedCTC": 600,
"noticePeriod": 60,
"experienceYears": 3,
"linkedinProfileUrl": "https://www.linkedin.com/in/meghana-kaki-0862b8167/",
"createdAt": "2025-09-27T06:14:07.000Z",
"updatedAt": "2025-09-27T06:14:07.000Z",
"statusName": "Pending",
"resumeFilename": null,
"resumeOriginalName": null,
"resumeUploadDate": null
}
]
}
```

---

### Get Candidate by ID

GET /candidate/:id

**Response:**

```json
{
"success": true,
"message": "Candidate retrieved successfully",
"data": {
"candidateId": 70,
"candidateName": "Palash A",
"contactNumber": "999999999",
"email": "random@exmaple.com",
"recruiterId": 1,
"recruiterName": "Palash Acharya",
"recruiterContact": "+91-9876543210",
"recruiterEmail": "palash.acharya@aerolens.in",
"jobRole": "SDE-2",
"expectedLocation":{
"city":"Ahemedabad",
"country":"India"
},
"currentLocation":{
"city":"Ahemedabad",
"country":"India"
}
"currentCTC": 10,
"expectedCTC": 12,
"noticePeriod": 15,
"experienceYears": 2,
"linkedinProfileUrl": "https://www.linkedin.com/in/palash-acharya-684732294/",
"statusName": "Selected",
"resumeFilename": "resumes/candidate_70_1763726746068.docx",
"resumeOriginalName": "AICTE_Internship_2024_Project_Report_Template_2.docx",
"resumeUploadDate": "2025-11-21T06:35:46.000Z"
}
}
```

---

### GET candidate form data

GET /candidate/create-data

**Response:**

```json
{
  "success": true,
  "message": "Interview Form Data retrieved successfully",
  "data": {
    "recruiters": [
      {
        "recruiterId": 1,
        "recruiterName": "Palash Acharya"
      },
      {
        "recruiterId": 420,
        "recruiterName": "Jaival Suthar"
      },
      {
        "recruiterId": 445,
        "recruiterName": "Bhavin Trivedi"
      },
      {
        "recruiterId": 447,
        "recruiterName": "Random User"
      },
      {
        "recruiterId": 454,
        "recruiterName": "Test User"
      },
      {
        "recruiterId": 455,
        "recruiterName": "Testing New Field"
      }
    ],
    "locations": [
      {
        "locationId": 1,
        "city": "Ahmedabad",
        "country": "India",
        "state": "Gujarat"
      },
      {
        "locationId": 2,
        "city": "Bangalore",
        "country": "India",
        "state": "Karnataka"
      },
      {
        "locationId": 3,
        "city": "Mountain View",
        "country": "United States",
        "state": "California"
      },
      {
        "locationId": 4,
        "city": "San Francisco",
        "country": "United States",
        "state": "California"
      },
      {
        "locationId": 6,
        "city": "Hyderabad",
        "country": "India",
        "state": "Telangana"
      },
      {
        "locationId": 8,
        "city": "Vancouver",
        "country": "Canada",
        "state": "British Columbia"
      }
    ]
  }
}
```

---

### Create Candidate (with optional resume upload)

POST /candidate
Content-Type: multipart/form-data
**Request Body (form-data):**

| Field              | Type        | Description                                                       |
| ------------------ | ----------- | ----------------------------------------------------------------- |
| candidateName      | String      | Candidate full name (required)                                    |
| contactNumber      | String      | Phone number (optional)                                           |
| email              | String      | Email address (optional)                                          |
| recruiterId        | String      | Recruiter Id (required) [must be in member table]                 |
| jobRole            | String      | Job title (required)                                              |
| expectedLocation   | JSON Object | must be a json object with city and country attributes (required) |
| currentCTC         | Number      | Current CTC in INR [supports decimals ie 12.5] (optional)         |
| expectedCTC        | Number      | Expected CTC in INR [supports decimal ie 12.5] (optional)         |
| noticePeriod       | Number      | Notice period in days (required)                                  |
| experienceYears    | Number      | Years of experience (required) [supports decimal]                 |
| linkedinProfileUrl | String      | LinkedIn URL (optional)                                           |
| resume             | File        | PDF resume, max 5MB (optional)                                    |
| notes              | string      | notes about candidates (optional)                                 |

**Response:**

```json
{
  "success": true,
  "message": "Candidate created successfully",
  "data": {
    "candidateId": 71,
    "candidateName": "Test Candidate",
    "contactNumber": "9998989876",
    "email": "testcandidate@example.com",
    "jobRole": "Java developer",
    "preferredJobLocation": 1,
    "currentCTC": 6,
    "expectedCTC": 9,
    "noticePeriod": 60,
    "experienceYears": 1,
    "recruiterId": 420,
    "createdOn": "2025-11-30T09:29:51.088Z"
  }
}
```

---

### Update Candidate

PATCH /candidate/:id
Content-Type: multipart/form-data

**Request Body (JSON) - fields to update:**
| Field | Type | Description |
| ------------------ | ----------- | --------------------------------------------------------- |
| candidateName | String | Candidate full name (optional) |
| contactNumber | String | Phone number (optional) |
| email | String | Email address (optional) |
| recruiterId | String | Recruiter Id (optional) [must be in member table] |
| jobRole | String | Job title (optional) |
| expectedLocation | JSON Object | must be a json object with city and country attributes |
| currentCTC | Number | Current CTC in INR [supports decimals ie 12.5] (optional) |
| expectedCTC | Number | Expected CTC in INR [supports decimal ie 12.5] (optional) |
| noticePeriod | Number | Notice period in days (optional) |
| experienceYears | Number | Years of experience (optional) [supports decimal] |
| linkedinProfileUrl | String | LinkedIn URL (optional) |
| resume | File | PDF resume, max 5MB (optional) |
| notes | string | notes about candidates (optional) |

```json
{
  "jobRole": "Senior Backend Developer",
  "expectedCTC": 1500000
}
```

**Response:**

```json
{
  "message": "Candidate updated successfully",
  "data": {
    "candidateId": 124,
    "candidateName": "Jane Smith",
    "jobRole": "Senior Backend Developer",
    "expectedCTC": 1500000,
    "statusName": "Pending"
  }
}
```

---

### Delete Candidate

DELETE /candidate/:id

**Response:**

```json
{
  "success": true,
  "message": "Candidate deleted successfully",
  "data": null
}
```

---

### Upload or Replace Resume

POST /candidate/:id/resume
Content-Type: multipart/form-data

**Form data:**

| Field  | Type | Description        |
| ------ | ---- | ------------------ |
| resume | File | PDF resume max 5MB |

**Response:**

```json
{
  "message": "Resume uploaded successfully",
  "data": {
    "candidateId": 124,
    "filename": "candidate124_resume.pdf",
    "originalName": "Jane_Smith_Resume.pdf",
    "size": 450000,
    "uploadDate": "2025-09-25T10:45:00.000Z"
  }
}
```

---

### Download Resume

GET /candidate/:id/resume

**Response:**

- Returns the PDF file as an attachment.

---

### Preview Resume Inline

GET /candidate/:id/resume/preview

**Response:**

- Displays the PDF inline in the browser.

---

### Delete Resume

DELETE /candidate/:id/resume

**Response:**

```json
{
  "message": "Resume deleted successfully"
}
```

---

## Error Response Example

```json
{
  "error": "Candidate with ID 999 not found",
  "code": 404
}
```

---

## Notes

- Resume files must be PDFs and no larger than 5MB.
- Email and contact number must be unique across candidates.
- Statuses include: selected, rejected, interview pending.
- Locations include: Ahmedabad, Bangalore, San Francisco.

---

# Lookup Endpoints

Base URL
/lookup

Response Format
All responses follow a consistent JSON structure.

Success Response
{
"success": true,
"message": "Operation successful",
"data": { ... },
"meta": { ... } // optional pagination info
}

Error Response
{
"success": false,
"error": "ERROR_CODE",
"message": "Description of the error",
"details": { ... }, // optional extra information
"stack": "..." // only available in development
}
Endpoints

1. Get All Lookup Entries

GET /api/lookup

Retrieve lookup entries.

GET /lookup
{
"success": true,
"message": "Lookup entries retrieved successfully",
"data": [
{
"lookupKey": 1,
"tag": "status",
"value": "active"
}
]
} 2. Get Lookup by Key

GET /lookup/:lookupKey

Retrieve a single lookup entry by its lookupKey.
URL Params

lookupKey (integer, required)

Example Request
GET /lookup/1

Example Response
{
"success": true,
"message": "Lookup entry retrieved successfully",
"data": [
{
"lookupKey": 1,
"tag": "status",
"value": "active"
}
]
}

3. Create Lookup Entry

POST /lookup

Create a new lookup entry with validation.

Request Body
{
"tag": "status",
"value": "inactive"
}
Validation Rules

tag: required, string, 1–100 characters

value: required, string, 1–500 characters

Example Response:
{
"success": true,
"message": "lookup created successfully",
"data": {
"lookupKey": 2,
"tag": "status",
"value": "inactive"
}
}

Error Example (Validation):
{
"success": false,
"error": "VALIDATION_ERROR",
"message": "Validation failed",
"details": {
"validationErrors": [
{ "field": "tag", "message": "Tag cannot be empty" }
]
}
}

4. Delete Lookup Entry

DELETE /lookup/:lookupKey

Delete a lookup entry by its lookupKey.

URL Params

lookupKey (integer, required)

Example Request
DELETE /lookup/1

Response
{
"success": true,
"message": "Lookup entry deleted successfully",
"data": {
"lookupKey": 1,
"deletedAt": "2025-09-26T13:31:20.123Z"
}
}

5. PATCH lookup Entry

PATCH /lookup/:lookupKey

URL Params

lookupKey (integer, required)

Example request
PATCH /lookup/9

{
"value":"Pending"
}

Response
{
"success": true,
"message": "Lookup entry updated successfully",
"data": {
"lookupKey": 9,
"value": "Pending"
}
}

Error Codes
VALIDATION_ERROR – Invalid input data

LOOKUP_NOT_FOUND – Lookup entry doesn’t exist

DUPLICATE_LOOKUP_VALUE – Entry with the same value already exists

DATABASE_ERROR – Generic database error

DATABASE_SCHEMA_ERROR – Missing table or invalid schema

DATABASE_CONNECTION_ERROR – Connection timeout or reset

---

# 👤 Member API – Request & Response Guide (Frontend Accurate)

This document describes **all Member-related API endpoints**, including **request formats**, **response formats**, and **business rules**, exactly as returned by the backend.

Base URL:

```
/api/member
```

All endpoints require authentication.

---

## 🔐 Authentication

All routes require a valid authenticated token.

```
Authorization: Bearer <token>
```

---

## 📌 Standard API Response Format

### ✅ Success Response (ALL endpoints)

```json
{
  "success": true,
  "message": "Descriptive message",
  "data": <response_payload>
}
```

### ❌ Error Response

```json
{
  "success": false,
  "message": "Error summary",
  "errorCode": "ERROR_CODE",
  "details": {
    "validationErrors": [
      {
        "field": "fieldName",
        "message": "Reason"
      }
    ]
  }
}
```

---

## 📄 GET – Member Form Data

Fetches all lookup data required to build **Member create/edit forms**.

### Endpoint

```
GET /member/form-data
```

---

### ✅ Success Response

```json
{
  "success": true,
  "message": "Member form data retrieved successfully",
  "data": {
    "designations": [{ "lookupKey": 1, "value": "Software Engineer" }],
    "vendors": [{ "vendorId": 3, "vendorName": "ABC Recruiters" }],
    "clients": [{ "clientId": 5, "clientName": "Acme Corp" }],
    "skills": [{ "skillId": 10, "skillName": "JavaScript" }],
    "locations": [
      {
        "locationId": 2,
        "city": "Bangalore",
        "state": "Karnataka",
        "country": "India"
      }
    ]
  }
}
```

---

## GET - Create User Form Data

Fetches all lookup data required to build **User create form**.

### Endpoint

```
GET /member/create-data
```

---

### Success Response

```json
{
  "success": true,
  "message": "Member create form data retrieved successfully",
  "data": {
    "designations": [
      {
        "designationId": 11,
        "designationName": "QA Automation Developer"
      },
      {
        "designationId": 12,
        "designationName": "Software Engineer"
      },
      {
        "designationId": 13,
        "designationName": "Sr. PHP Developer"
      },
      {
        "designationId": 14,
        "designationName": "Head Of Engineering"
      },
      {
        "designationId": 24,
        "designationName": "Admin"
      },
      {
        "designationId": 36,
        "designationName": "test-engineer"
      },
      {
        "designationId": 40,
        "designationName": "Staff Software Engineer"
      }
    ],
    "vendors": [
      {
        "vendorId": 3,
        "vendorName": "Random Vendor A"
      }
    ]
  }
}
```

---

## 📄 GET – All Members

Fetches all **active members**.

### Endpoint

```
GET /member
```

---

### ✅ Success Response

```json
{
  "success": true,
  "message": "Members retrieved successfully",
  "data": [
    {
      "memberId": 1,
      "memberName": "John Doe",
      "memberContact": "+91 9999999999",
      "email": "john@example.com",
      "designationId": 24,
      "designation": "Recruiter",
      "isRecruiter": true,
      "isInterviewer": false,
      "vendorId": 2,
      "vendorName": "Random Vendor A",
      "clientId": 4,
      "clientName": "Acme Corp",
      "organisation": "Acme Corp",
      "city": "Mumbai",
      "country": "India",
      "interviewerCapacity": null,
      "skills": [
        {
          "skillId": 10,
          "skillName": "Communication",
          "proficiencyLevel": "Advanced",
          "yearsOfExperience": 5
        }
      ],
      "isActive": true,
      "createdAt": "2024-01-01T10:00:00.000Z",
      "updatedAt": "2024-01-10T10:00:00.000Z"
    }
  ]
}
```

---

## 📄 GET – Member By ID

Fetches a **single active member** by ID.

### Endpoint

```
GET /member/:memberId
```

---

### ✅ Success Response

```json
{
  "success": true,
  "message": "Member entry retrieved successfully",
  "data": {
    "memberId": 1,
    "memberName": "John Doe",
    "memberContact": "+91 9999999999",
    "email": "john@example.com",
    "designationId": 24,
    "designation": "Recruiter",
    "isRecruiter": true,
    "isInterviewer": false,
    "vendorId": 2,
    "vendorName": "Random Vendor A",
    "clientId": 4,
    "clientName": "Acme Corp",
    "organisation": "Acme Corp",
    "cityName": "Mumbai",
    "country": "India",
    "interviewerCapacity": null,
    "skills": [
      {
        "skillId": 10,
        "skillName": "Communication",
        "proficiencyLevel": "Advanced",
        "yearsOfExperience": 5
      }
    ],
    "isActive": true,
    "createdAt": "2024-01-01T10:00:00.000Z",
    "updatedAt": "2024-01-10T10:00:00.000Z"
  }
}
```

---

## ✏️ PATCH – Update Member

Updates **only the fields provided**.

### Endpoint

```
PATCH /member/:memberId
```

> At least **one field is required**

---

### ✅ Allowed Request Payload

```json
{
  "memberName": "Jane Doe",
  "memberContact": "+91 8888888888",
  "email": "jane@example.com",
  "designationId": 24,
  "isRecruiter": true,
  "isInterviewer": false,
  "clientId": 3,
  "organisation": "New Org",
  "vendorId": 2,
  "interviewerCapacity": 5,
  "location": {
    "city": "Pune",
    "country": "India"
  },
  "skills": [
    {
      "skillName": "Java",
      "proficiencyLevel": "Advanced",
      "yearsOfExperience": 6
    }
  ]
}
```

---

### 🚨 Business Rules (Strictly Enforced)

- `vendorId` can only be assigned if:

  - Member **is already a recruiter**, OR
  - `isRecruiter: true` is provided in the same request

- Setting `isRecruiter: false` → `vendorId` is automatically cleared
- Setting `isInterviewer: false` → `interviewerCapacity` becomes `null`
- Updating `skills` **replaces all existing skills**
- skills, and location names are internally converted to IDs

---

### ✅ Success Response

```json
{
  "success": true,
  "message": "Member entry updated successfully",
  "data": {
    "memberId": 1,
    "memberName": "Jane Doe",
    "isRecruiter": true,
    "vendorId": 2
  }
}
```

---

## 🗑️ DELETE – Delete Member (Soft Delete)

Soft-deletes a member. Permanent deletion occurs later via background cleanup.

### Endpoint

```
DELETE /member/:memberId
```

---

### 🚫 Deletion Restrictions

Deletion is blocked if the member:

- Is recruiter for **active candidates**
- Is interviewer for **active interviews**

---

### ✅ Success Response

```json
{
  "success": true,
  "message": "Member entry deactivated successfully and will be deleted from database in 10 days",
  "data": {
    "deletedMember": {
      "memberId": 1,
      "memberName": "John Doe"
    },
    "interviewsDeleted": 0,
    "interviewsUnlinked": 2
  }
}
```

---

## ❌ Common Error Codes

| Error Code                       | Meaning                            |
| -------------------------------- | ---------------------------------- |
| `VALIDATION_ERROR`               | Invalid request payload            |
| `MEMBER_NOT_FOUND`               | Member ID does not exist           |
| `INVALID_VENDOR_ID`              | Vendor ID is invalid               |
| `VENDOR_ASSOCIATION_NOT_ALLOWED` | Vendor assigned to non-recruiter   |
| `MEMBER_HAS_CANDIDATES`          | Member linked to active candidates |
| `MEMBER_HAS_INTERVIEWS`          | Member linked to active interviews |
| `MEMBER_FORM_DATA_FETCH_ERROR`   | Failed to load form data           |

---

# Location Endpoints

Authentication
All endpoints require a valid JWT Bearer token in the Authorization header.

Header Format:

Authorization: Bearer <JWT_TOKEN>
Middleware: authenticate middleware validates the token before processing.

API Endpoints
Get All Locations

Retrieves all locations in the system.

Request:
GET /api/location HTTP/1.1
Host: api.example.com
Authorization: Bearer <JWT_TOKEN>
Response (200 OK):
{
"success": true,
"data": {
"data": [
{
"locationId": 1,
"city": "Bangalore",
"country": "India",
"state": "Karnataka"
},
{
"locationId": 2,
"city": "San Francisco",
"country": "United States",
"state": "California"
}
]
},
"message": "All Locations retrieved successfully",
"statusCode": 200
}
Get Location by ID
Retrieves a specific location by its ID.

Request:

GET /api/location/:locationId HTTP/1.1
Host: api.example.com
Authorization: Bearer <JWT_TOKEN>
Path Parameters:

| Parameter  | Type    | Required | Description              |
| ---------- | ------- | -------- | ------------------------ |
| locationId | Integer | Yes      | Id of the location entry |

Example:

GET /api/location/1 HTTP/1.1
Response (200 OK):

{
"success": true,
"data": {
"data": [
{
"locationId": 1,
"city": "Bangalore",
"country": "India",
"state": "Karnataka"
}
]
},
"message": "Location entry retrieved successfully",
"statusCode": 200
}
Error Response (404 Not Found):
{
"success": false,
"message": "Location with ID 999 not found",
"errorCode": "LOCATION_ID_NOT_FOUND",
"statusCode": 404
}
Create Location

Creates a new location entry.

Request:
POST /api/location HTTP/1.1
Host: api.example.com
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
Request Body:

| Field   | Type   | Required | Description                                                                     |
| ------- | ------ | -------- | ------------------------------------------------------------------------------- |
| city    | Stirng | Yes      | Name of the city (must be unique)                                               |
| country | string | Yes      | Name of the Country, must be 'India' or 'United States' exactly with the casing |
| state   | string | no       | Name of the state                                                               |

Example Request:
curl -X POST http://api.example.com/api/location \
 -H "Authorization: Bearer <JWT_TOKEN>" \
 -H "Content-Type: application/json" \
 -d '{
"city": "Mumbai",
"country": "India",
"state": "Maharashtra"
}'
Response (201 Created):

{
"success": true,
"data": {
"locationId": 3,
"city": "Mumbai",
"country": "India",
"state": "Maharashtra"
},
"message": "location created successfully",
"statusCode": 201
}
Error Response (409 Conflict - Duplicate):

{
"success": false,
"message": "A location with this city name already exists",
"errorCode": "DUPLICATE_LOCATION_VALUE",
"statusCode": 409
}
Error Response (400 Validation):
{
"success": false,
"message": "Validation failed",
"errorCode": "VALIDATION_ERROR",
"statusCode": 400,
"validationErrors": [
{
"field": "city",
"message": "city cannot be empty"
},
{
"field": "country",
"message": "country must be one of 'India' or 'United States'"
}
]
}
Update Location

Updates an existing location (partial update supported).

Request:

PATCH /api/location/:locationId HTTP/1.1
Host: api.example.com
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
Path Parameters:

| Parameter  | Type    | Required | Description              |
| ---------- | ------- | -------- | ------------------------ |
| locationId | Integer | Yes      | Id of the location entry |

Request Body (all fields optional, but at least one required):

| Field   | Type   | Required | Description                                                                     |
| ------- | ------ | -------- | ------------------------------------------------------------------------------- |
| city    | Stirng | No       | Name of the city (must be unique)                                               |
| country | string | No       | Name of the Country, must be 'India' or 'United States' exactly with the casing |
| state   | string | No       | Name of the state                                                               |

Example Request:

bash
curl -X PATCH http://api.example.com/api/location/1 \
 -H "Authorization: Bearer <JWT_TOKEN>" \
 -H "Content-Type: application/json" \
 -d '{
"state": "Tamil Nadu"
}'
Response (200 OK):
{
"success": true,
"data": {
"locationId": 1,
"city": "Bangalore",
"country": "India",
"state": "Tamil Nadu"
},
"message": "location entry updated successfully",
"statusCode": 200
}
Error Response (404 Not Found):
{
"success": false,
"message": "Location with ID 999 does not exist",
"errorCode": "LOCATION_NOT_FOUND",
"statusCode": 404,
"suggestion": "Please verify the Location Id and try again"
}
Error Response (400 - No Fields Provided):
{
"success": false,
"message": "Validation failed",
"errorCode": "VALIDATION_ERROR",
"statusCode": 400,
"validationErrors": [
{
"field": "object",
"message": "At least one field must be provided for update"
}
]
}
Delete Location

Deletes a location entry.

Request:

DELETE /api/location/:locationId HTTP/1.1
Host: api.example.com
Authorization: Bearer <JWT_TOKEN>
Path Parameters:

| Parameter  | Type    | Required | Description              |
| ---------- | ------- | -------- | ------------------------ |
| locationId | Integer | Yes      | Id of the location entry |

Example Request:

bash
curl -X DELETE http://api.example.com/api/location/1 \
 -H "Authorization: Bearer <JWT_TOKEN>"
Response (200 OK):

{
"success": true,
"data": null,
"message": "Location deleted successfully",
"statusCode": 200
}
Error Response (404 Not Found):

{
"success": false,
"message": "Location with ID 999 not found",
"errorCode": "LOCATION_NOT_FOUND",
"statusCode": 404
}
Request/Response Examples
Example 1: Create Multiple Locations

Request 1:

bash
curl -X POST http://api.example.com/api/location \
 -H "Authorization: Bearer eyJhbGc..." \
 -H "Content-Type: application/json" \
 -d '{"city":"Delhi","country":"India","state":"Delhi"}'
Request 2:

bash
curl -X POST http://api.example.com/api/location \
 -H "Authorization: Bearer eyJhbGc..." \
 -H "Content-Type: application/json" \
 -d '{"city":"New York","country":"United States","state":"New York"}'
Example 2: Complete Update Workflow

bash

# 1. Get location

GET /api/location/1

# 2. Update state only

PATCH /api/location/1
{"state": "Telangana"}

Validation Rules
Create Request Validation

| **Field**   | **Rule**                                                | **Error Message**                                                                 |
| ----------- | ------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **city**    | Required, 1–100 chars, trimmed                          | "city cannot be empty" or "city cannot exceed 100 characters"                     |
| **country** | Required, must be either **India** or **United States** | "country must be one of 'India' or 'United States'"                               |
| **state**   | Optional, 1–100 chars if provided                       | "state must be at least 1 character long" or "state cannot exceed 100 characters" |

Unknown fields Stripped automatically -
Update Request Validation

| **Field**              | **Rule**                            | **Error Message**                                |
| ---------------------- | ----------------------------------- | ------------------------------------------------ |
| **city**               | Optional, 1–100 chars if provided   | Same as create                                   |
| **country**            | Optional, must be valid if provided | Same as create                                   |
| **state**              | Optional, 1–100 chars if provided   | Same as create                                   |
| **At least one field** | Required                            | "At least one field must be provided for update" |
| **Unknown fields**     | Stripped automatically              | –                                                |

At least one field Required "At least one field must be provided for update"
Unknown fields Stripped automatically -
Path Parameter Validation

| **Parameter**  | **Rule**                   | **Error Message**                                                  |
| -------------- | -------------------------- | ------------------------------------------------------------------ |
| **locationId** | Required, positive integer | "Location Id must be positive" or "Location Id must be an integer" |

Error Handling
Error Response Structure

All error responses follow this format:

{
"success": false,
"message": "Human-readable error message",
"errorCode": "MACHINE_READABLE_CODE",
"statusCode": 400,
"validationErrors": [],
"metadata": {}
}

Here is your **rewritten README with proper Markdown structure and valid, consistently formatted JSON**, **without changing any content or meaning**.
I’ve only fixed:

- Broken code fences
- JSON indentation
- Missing/extra backticks
- Section boundaries

---

# Interview Management API

This API provides endpoints to manage interviews in an HRMS system, including scheduling, updating, finalizing, and reporting on interviews.

---

## Base URL

```
/api/interview
```

All endpoints require authentication via the `authenticate` middleware and audit context via `auditContextMiddleware`.

---

## Endpoints

### 1. Get All Interviews

Fetch all active interviews.

- **Method:** `GET`
- **Path:** `/`

**Response:**

```json
{
  "success": true,
  "message": "Interview entries retrieved successfully",
  "data": [
    {
      "interviewId": 1,
      "roundNumber": 1,
      "totalInterviews": 2,
      "interviewDate": "2025-12-15",
      "fromTime": "10:00",
      "toTime": "10:45",
      "durationMinutes": 45,
      "candidateId": 101,
      "candidateName": "John Doe",
      "interviewerId": 201,
      "interviewerName": "Alice Smith",
      "scheduledById": 301,
      "scheduledByName": "Bob Johnson",
      "result": "pending",
      "recruiterNotes": "Initial screening",
      "interviewerFeedback": null,
      "isActive": true
    }
  ]
}
```

---

### 2. Get Interview Form Data

- **Method:** `GET`
- **Path:** `/create-data`

**Response:**

```json
{
  "success": true,
  "message": "Interview Form Data retrieved successfully",
  "data": {
    "interview": null,
    "interviewers": [
      {
        "interviewerId": 201,
        "interviewerName": "Alice Smith"
      }
    ],
    "recruiters": [
      {
        "recruiterId": 301,
        "recruiterName": "Bob Johnson"
      }
    ],
    "candidates": []
  }
}
```

---

### 3. Get Interviews by Candidate

- **Method:** `GET`
- **Path:** `/candidate/:candidateId`

- **Response:**

```
{
  "success": true,
  "message": "Candidate interviews retrieved successfully",
  "data": {
    "candidateId": 101,
    "totalRounds": 2,
    "data": [
      {
        "interviewId": 1,
        "roundNumber": 1,
        "totalInterviews": 2,
        "interviewDate": "2025-12-15",
        "fromTime": "10:00",
        "toTime": "10:45",
        "durationMinutes": 45,
        "result": "pending",
        "interviewerId": 201,
        "interviewerName": "Alice Smith"
      }
    ]
  }
}
```

---

### 4. Get Interview by ID

Fetch a single interview by its ID.

- **Method:** `GET`
- **Path:** `/:interviewId`
- **Params:**

| Field         | Type   | Required | Description         |
| ------------- | ------ | -------- | ------------------- |
| `interviewId` | number | Yes      | ID of the interview |

- **Response:**

```
{
  "success": true,
  "message": "Interview entry retrieved successfully",
  "data": {
    "interviewId": 1,
    "roundNumber": 1,
    "totalInterviews": 2,
    "interviewDate": "2025-12-15",
    "fromTime": "10:00",
    "toTime": "10:45",
    "durationMinutes": 45,
    "candidateId": 101,
    "candidateName": "John Doe",
    "interviewerId": 201,
    "interviewerName": "Alice Smith",
    "scheduledById": 301,
    "scheduledByName": "Bob Johnson",
    "result": "pending",
    "recruiterNotes": "Initial screening",
    "interviewerFeedback": null
  }
}
```

---

### 5. Create Interview

Schedule a new interview for a candidate.

- **Method:** `POST`
- **Path:** `/:candidateId`
- **Params:**

| Field         | Type   | Required | Description         |
| ------------- | ------ | -------- | ------------------- |
| `candidateId` | number | Yes      | ID of the candidate |

- **Request Body:**

```
{
  "interviewDate": "2025-12-15",
  "fromTime": "10:00",
  "durationMinutes": 45,
  "interviewerId": 201,
  "scheduledById": 301,
  "result": "pending",
  "recruiterNotes": "Initial screening",
  "interviewerFeedback": null
}
```

- **Validation Rules:**

| Field                 | Type   | Rules                                                             |
| --------------------- | ------ | ----------------------------------------------------------------- |
| `interviewDate`       | string | YYYY-MM-DD format, cannot be in the past, required                |
| `fromTime`            | string | HH:MM format (00:00–23:59), required                              |
| `durationMinutes`     | number | Integer, 15–480 minutes, required                                 |
| `interviewerId`       | number | Positive integer, required                                        |
| `scheduledById`       | number | Positive integer, required                                        |
| `result`              | string | One of: `pending`, `selected`, `rejected`, `cancelled` (optional) |
| `recruiterNotes`      | string | Max 1000 characters, optional, can be `""` or `null`              |
| `interviewerFeedback` | string | Max 2000 characters, optional, can be `""` or `null`              |

- **Response (201 Created):**

```
{
  "success": true,
  "message": "interview created successfully",
  "data": {
    "interviewId": 1,
    "candidateId": 101,
    "roundNumber": 1,
    "totalInterviews": 1,
    "interviewDate": "2025-12-15",
    "fromTime": "10:00",
    "durationMinutes": 45,
    "interviewerId": 201,
    "scheduledById": 301,
    "result": "pending",
    "recruiterNotes": "Initial screening",
    "interviewerFeedback": null
  }
}
```

---

### 6. Schedule Next Round

Schedule the next interview round for a candidate (must have at least one existing interview).

- **Method:** `POST`
- **Path:** `/:candidateId/rounds`
- **Params:**

| Field         | Type   | Required | Description         |
| ------------- | ------ | -------- | ------------------- |
| `candidateId` | number | Yes      | ID of the candidate |

- **Request Body:** Same as `Create Interview` (no `result`, `recruiterNotes`, `interviewerFeedback` required).

- **Response (201 Created):**

```
{
  "success": true,
  "message": "Successfully scheduled round 2 for candidate",
  "data": {
    "interviewId": 2,
    "candidateId": 101,
    "roundNumber": 2,
    "totalInterviews": 2,
    "interviewDate": "2025-12-16",
    "fromTime": "14:00",
    "durationMinutes": 60,
    "interviewerId": 202,
    "scheduledById": 301
  }
}
```

---

## Get Finalization Form Data

### `GET /interview/:interviewId/finalize-data`

**Response**

| Field                 | Type   | Rules                                                            |
| --------------------- | ------ | ---------------------------------------------------------------- |
| `result`              | string | One of: `pending`, `selected`, `rejected`, `cancelled`, required |
| `recruiterNotes`      | string | Max 1000 characters, optional, can be `""` or `null`             |
| `interviewerFeedback` | string | Max 2000 characters, optional, can be `""` or `null`             |

- **Response:**

```
{
  "success": true,
  "message": "Finalize Interview Form Data retrieved successfully",
  "data": {
    "interviewId": 12,
    "result": "Pending",
    "recruiterNotes": null,
    "interviewerFeedback": null,
    "meetingUrl": null
  }
}
```

---

## Finalize Interview

### `PUT /interview/:interviewId/finalize`

**Request**

```
{
  "result": "Selected",
  "recruiterNotes": "Strong communication skills",
  "interviewerFeedback": "Excellent problem solving",
  "meetingUrl": "https://meet.google.com/abc-defg-hij"
}
```

---

## Error Response Format

- **Method:** `GET`
- **Path:** `/report/overall`
- **Response:**

```
{
  "success": false,
  "message": "Validation failed",
  "error": {
    "code": "VALIDATION_ERROR",
    "details": {
      "validationErrors": [
        {
          "field": "interviewDate",
          "message": "Interview date must be in YYYY-MM-DD format"
        }
      ]
    }
  }
}
```

---

### Interviewer Time Conflict

```json
{
  "success": false,
  "message": "Interviewer is already scheduled at this time",
  "error": {
    "code": "INTERVIEWER_TIME_CONFLICT",
    "details": {
      "interviewerId": "conflict",
      "interviewDate": "conflict",
      "fromTime": "conflict"
    }
  }
}
```

---

### Candidate Time Conflict

- **Response:**

```
{
  "success": false,
  "message": "Candidate already has an interview scheduled at this time",
  "error": {
    "code": "CANDIDATE_TIME_CONFLICT",
    "details": {
      "candidateId": "conflict",
      "interviewDate": "conflict",
      "fromTime": "conflict"
    }
  }
}
```

---

### Generic Interview Scheduling Conflict

```json
{
  "success": false,
  "message": "Interview scheduling conflict",
  "error": {
    "code": "INTERVIEW_CONFLICT"
  },
  "details": null
}
```

---

## Common Error Codes

- `VALIDATION_ERROR`
- `INTERVIEW_ENTRY_NOT_FOUND`
- `NO_PREVIOUS_INTERVIEWS`
- `INTERVIEW_NOT_FOUND`
- `DATABASE_ERROR`
- `DATABASE_SCHEMA_ERROR`

---

## Notes

- All dates are in `YYYY-MM-DD` format
- Time is in `HH:MM` 24-hour format
- `result` is always returned in capitalized form
- Soft-deleted interviews are excluded from reports
- Round numbers are automatically renumbered on delete

---

# Vendor API

This module manages **recruitment vendors** with full CRUD support, validation, audit logging, and consistent error handling.

---

## 🔐 Authentication

All vendor endpoints are **protected**.

**Requirement**

```
Authorization: Bearer <JWT_TOKEN>
```

---

## Base URL

```
/vendor
```

---

## Vendor Object

```json
{
  "vendorId": 1,
  "vendorName": "ABC Recruiters",
  "vendorPhone": "+91 9876543210",
  "vendorEmail": "contact@abcrecruiters.com"
}
```

---

## Endpoints

---

## 1️⃣ Get All Vendors

### ➤ Request

```
GET /vendor
```

### ➤ Response (200 OK)

```json
{
  "success": true,
  "message": "Vendor entries retrieved successfully",
  "data": [
    {
      "vendorId": 1,
      "vendorName": "ABC Recruiters",
      "vendorPhone": "+91 9876543210",
      "vendorEmail": "contact@abcrecruiters.com"
    }
  ]
}
```

---

## 2️⃣ Create Vendor

### ➤ Request

```
POST /vendor
```

### ➤ Request Body

```json
{
  "vendorName": "ABC Recruiters",
  "vendorPhone": "+91 9876543210",
  "vendorEmail": "contact@abcrecruiters.com"
}
```

> `vendorPhone` and `vendorEmail` are optional

### ➤ Response (201 Created)

```json
{
  "success": true,
  "message": "Vendor created successfully",
  "data": {
    "vendorId": 1,
    "vendorName": "ABC Recruiters",
    "vendorPhone": "+91 9876543210",
    "vendorEmail": "contact@abcrecruiters.com"
  }
}
```

---

## 3️⃣ Get Vendor by ID

### ➤ Request

```
GET /vendor/:vendorId
```

### ➤ Response (200 OK)

```json
{
  "success": true,
  "message": "Vendor retrieved successfully",
  "data": {
    "vendorId": 1,
    "vendorName": "ABC Recruiters",
    "vendorPhone": "+91 9876543210",
    "vendorEmail": "contact@abcrecruiters.com"
  }
}
```

---

## 4️⃣ Update Vendor (Partial Update)

### ➤ Request

```
PATCH /vendor/:vendorId
```

### ➤ Request Body (any subset)

```json
{
  "vendorPhone": "+91 9999999999"
}
```

### ➤ Response (200 OK)

```json
{
  "success": true,
  "message": "Vendor updated successfully",
  "data": {
    "vendorId": 1,
    "vendorName": "ABC Recruiters",
    "vendorPhone": "+91 9999999999",
    "vendorEmail": "contact@abcrecruiters.com"
  }
}
```

---

## 5️⃣ Delete Vendor

### ➤ Request

```
DELETE /vendor/:vendorId
```

### ➤ Response (200 OK)

```json
{
  "success": true,
  "message": "Vendor deleted successfully",
  "data": null
}
```

---

## ⚠️ Error Handling

All errors follow a **consistent structure**.

### ❌ Error Response Format

```json
{
  "success": false,
  "code": "ERROR_CODE",
  "message": "Human readable message",
  "details": {}
}
```

---

## 🚨 Error Codes

| Code                    | HTTP | Description                              |
| ----------------------- | ---- | ---------------------------------------- |
| `VALIDATION_ERROR`      | 400  | Request body or params validation failed |
| `VENDOR_DUPLICATE`      | 409  | Vendor phone or email already exists     |
| `VENDOR_NOT_FOUND`      | 404  | Vendor ID does not exist                 |
| `INVALID_UPDATE_FIELDS` | 400  | No valid fields provided for update      |
| `DATABASE_ERROR`        | 500  | Internal database or server error        |

---

## 🧪 Example Validation Error

```json
{
  "success": false,
  "code": "VALIDATION_ERROR",
  "message": "Validation failed",
  "details": {
    "validationErrors": [
      {
        "field": "vendorEmail",
        "message": "Vendor email must be a valid email address"
      }
    ]
  }
}
```

---

## 🔁 Data Normalization Rules

| Input               | Stored Value  |
| ------------------- | ------------- |
| `""` (empty string) | `null`        |
| `undefined`         | Field ignored |
| `null`              | `null`        |
| Valid string        | Stored as-is  |

---

## 🛡️ Additional Notes

- All write operations are **transactional**
- All changes are **audit logged**
- Partial updates are **whitelisted**
- Duplicate detection is enforced at both **service** and **database** levels
- Error codes are **stable and frontend-safe**

---

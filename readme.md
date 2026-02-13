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

API endpoints for managing job profiles, including CRUD operations and Job Description (JD) file management.

**Base URL:** `/api/jobProfile`

**Authentication:** All endpoints require authentication via the `authenticate` middleware.

---

## Table of Contents

- [Create Job Profile](#create-job-profile)
- [Get All Job Profiles](#get-all-job-profiles)
- [Get Job Profile by ID](#get-job-profile-by-id)
- [Update Job Profile](#update-job-profile)
- [Delete Job Profile](#delete-job-profile)
- [Upload JD File](#upload-jd-file)
- [Download JD File](#download-jd-file)
- [Preview JD File](#preview-jd-file)
- [Delete JD File](#delete-jd-file)
- [Get JD File Info](#get-jd-file-info)

---

## Create Job Profile

Create a new job profile with optional JD file upload.

**Endpoint:** `POST /`

**Content-Type:** `multipart/form-data`

### Request Body

| Field              | Type                | Required | Description                                                                        | Constraints                 |
| ------------------ | ------------------- | -------- | ---------------------------------------------------------------------------------- | --------------------------- |
| position           | string              | Yes      | Job position/role title                                                            | 2-100 characters            |
| experience         | string              | No       | Experience description                                                             | Max 50 characters           |
| experienceMinYears | number              | No       | Minimum years of experience                                                        | 0-99.99                     |
| experienceMaxYears | number              | No       | Maximum years of experience                                                        | 0-99.99                     |
| overview           | string/object/array | No       | Job overview (see [Structured Content Format](#structured-content-format))         | Max 5000 characters         |
| responsibilities   | string/object/array | No       | Key responsibilities (see [Structured Content Format](#structured-content-format)) | Max 5000 characters         |
| requiredSkills     | string/object/array | No       | Required skills (see [Structured Content Format](#structured-content-format))      | Max 5000 characters         |
| niceToHave         | string/object/array | No       | Nice-to-have skills (see [Structured Content Format](#structured-content-format))  | Max 5000 characters         |
| techSpecifications | string/array        | No       | Technical specification IDs (comma-separated string or array)                      | Positive integers           |
| JD                 | file                | No       | Job description file                                                               | PDF, DOC, or DOCX (max 5MB) |

### Example Request

```json
{
  "position": "Senior Software Engineer",
  "experience": "5-8 years",
  "experienceMinYears": 5,
  "experienceMaxYears": 8,
  "overview": "We are looking for an experienced software engineer...",
  "responsibilities": {
    "type": "bullets",
    "content": [
      { "text": "Design and develop scalable applications" },
      { "text": "Lead code reviews and mentor junior developers" }
    ]
  },
  "requiredSkills": {
    "type": "bullets",
    "content": [
      { "text": "Proficiency in JavaScript and Node.js" },
      { "text": "Experience with React and Vue.js" }
    ]
  },
  "niceToHave": "Experience with AWS services",
  "techSpecifications": "1,2,3"
}
```

### Success Response

**Status Code:** `201 Created`

```json
{
  "status": "success",
  "message": "Job Profile created successfully",
  "data": {
    "jobProfileId": 1,
    "position": "Senior Software Engineer",
    "experience": "5-8 years",
    "experienceMinYears": 5,
    "experienceMaxYears": 8,
    "overview": "We are looking for an experienced software engineer...",
    "responsibilities": "Design and develop scalable applications\nLead code reviews and mentor junior developers",
    "requiredSkills": "Proficiency in JavaScript and Node.js\nExperience with React and Vue.js",
    "niceToHave": "Experience with AWS services",
    "techSpecifications": [
      {
        "techSpecificationId": 1,
        "techSpecificationName": "JavaScript"
      },
      {
        "techSpecificationId": 2,
        "techSpecificationName": "React"
      }
    ],
    "jdFileName": "jd-descriptions/jobProfile_1_1234567890.pdf",
    "jdOriginalName": "job_description.pdf",
    "jdUploadDate": "2026-01-29T10:30:00.000Z",
    "createdAt": "2026-01-29T10:30:00.000Z",
    "updatedAt": "2026-01-29T10:30:00.000Z"
  }
}
```

### Error Responses

**Status Code:** `400 Bad Request`

```json
{
  "status": "error",
  "message": "Validation failed",
  "errorCode": "VALIDATION_ERROR",
  "data": {
    "validationErrors": [
      {
        "field": "position",
        "message": "Position is required"
      }
    ]
  }
}
```

**Status Code:** `409 Conflict`

```json
{
  "status": "error",
  "message": "A job profile with this role already exists",
  "errorCode": "DUPLICATE_JOB_ROLE"
}
```

---

## Get All Job Profiles

Retrieve all job profiles.

**Endpoint:** `GET /`

### Success Response

**Status Code:** `200 OK`

```json
{
  "status": "success",
  "message": "Job Profiles retrieved successfully",
  "data": [
    {
      "jobProfileId": 1,
      "position": "Senior Software Engineer",
      "experience": "5-8 years",
      "experienceMinYears": 5,
      "experienceMaxYears": 8,
      "overview": "We are looking for an experienced software engineer...",
      "responsibilities": "Design and develop scalable applications\nLead code reviews and mentor junior developers",
      "requiredSkills": "Proficiency in JavaScript and Node.js\nExperience with React and Vue.js",
      "niceToHave": "Experience with AWS services",
      "techSpecifications": [
        {
          "techSpecificationId": 1,
          "techSpecificationName": "JavaScript"
        }
      ],
      "jdFileName": "jd-descriptions/jobProfile_1_1234567890.pdf",
      "jdOriginalName": "job_description.pdf",
      "jdUploadDate": "2026-01-29T10:30:00.000Z",
      "createdAt": "2026-01-29T10:30:00.000Z",
      "updatedAt": "2026-01-29T10:30:00.000Z"
    }
  ]
}
```

---

## Get Job Profile by ID

Retrieve a specific job profile by ID.

**Endpoint:** `GET /:id`

### Path Parameters

| Parameter | Type    | Required | Description    |
| --------- | ------- | -------- | -------------- |
| id        | integer | Yes      | Job profile ID |

### Success Response

**Status Code:** `200 OK`

```json
{
  "status": "success",
  "message": "Job Profile retrieved successfully",
  "data": {
    "jobProfileId": 1,
    "position": "Senior Software Engineer",
    "experience": "5-8 years",
    "experienceMinYears": 5,
    "experienceMaxYears": 8,
    "overview": "We are looking for an experienced software engineer...",
    "responsibilities": "Design and develop scalable applications\nLead code reviews and mentor junior developers",
    "requiredSkills": "Proficiency in JavaScript and Node.js\nExperience with React and Vue.js",
    "niceToHave": "Experience with AWS services",
    "techSpecifications": [
      {
        "techSpecificationId": 1,
        "techSpecificationName": "JavaScript"
      }
    ],
    "jdFileName": "jd-descriptions/jobProfile_1_1234567890.pdf",
    "jdOriginalName": "job_description.pdf",
    "jdUploadDate": "2026-01-29T10:30:00.000Z",
    "createdAt": "2026-01-29T10:30:00.000Z",
    "updatedAt": "2026-01-29T10:30:00.000Z"
  }
}
```

### Error Response

**Status Code:** `404 Not Found`

```json
{
  "status": "error",
  "message": "Job profile with ID 999 not found",
  "errorCode": "JOB_PROFILE_NOT_FOUND"
}
```

---

## Update Job Profile

Update an existing job profile with optional JD file replacement.

**Endpoint:** `PATCH /:id`

**Content-Type:** `multipart/form-data`

### Path Parameters

| Parameter | Type    | Required | Description    |
| --------- | ------- | -------- | -------------- |
| id        | integer | Yes      | Job profile ID |

### Request Body

All fields are optional. Only include fields you want to update.

| Field              | Type                | Description                                                                        | Constraints                 |
| ------------------ | ------------------- | ---------------------------------------------------------------------------------- | --------------------------- |
| position           | string              | Job position/role title                                                            | 2-100 characters            |
| experience         | string              | Experience description                                                             | Max 50 characters           |
| experienceMinYears | number              | Minimum years of experience                                                        | 0-99.99                     |
| experienceMaxYears | number              | Maximum years of experience                                                        | 0-99.99                     |
| overview           | string/object/array | Job overview (see [Structured Content Format](#structured-content-format))         | Max 5000 characters         |
| responsibilities   | string/object/array | Key responsibilities (see [Structured Content Format](#structured-content-format)) | Max 5000 characters         |
| requiredSkills     | string/object/array | Required skills (see [Structured Content Format](#structured-content-format))      | Max 5000 characters         |
| niceToHave         | string/object/array | Nice-to-have skills (see [Structured Content Format](#structured-content-format))  | Max 5000 characters         |
| techSpecifications | string/array        | Technical specification IDs (comma-separated string or array)                      | Positive integers           |
| JD                 | file                | Job description file (replaces existing)                                           | PDF, DOC, or DOCX (max 5MB) |

### Example Request

```json
{
  "position": "Lead Software Engineer",
  "experienceMinYears": 6,
  "techSpecifications": "1,2,3,4"
}
```

### Success Response

**Status Code:** `200 OK`

```json
{
  "status": "success",
  "message": "Job Profile updated successfully",
  "data": {
    "jobProfileId": 1,
    "position": "Lead Software Engineer",
    "experience": "5-8 years",
    "experienceMinYears": 6,
    "experienceMaxYears": 8,
    "overview": "We are looking for an experienced software engineer...",
    "responsibilities": "Design and develop scalable applications\nLead code reviews and mentor junior developers",
    "requiredSkills": "Proficiency in JavaScript and Node.js\nExperience with React and Vue.js",
    "niceToHave": "Experience with AWS services",
    "techSpecifications": [
      {
        "techSpecificationId": 1,
        "techSpecificationName": "JavaScript"
      },
      {
        "techSpecificationId": 2,
        "techSpecificationName": "React"
      },
      {
        "techSpecificationId": 3,
        "techSpecificationName": "Node.js"
      },
      {
        "techSpecificationId": 4,
        "techSpecificationName": "TypeScript"
      }
    ],
    "jdFileName": "jd-descriptions/jobProfile_1_1234567890.pdf",
    "jdOriginalName": "updated_job_description.pdf",
    "jdUploadDate": "2026-01-29T11:00:00.000Z",
    "createdAt": "2026-01-29T10:30:00.000Z",
    "updatedAt": "2026-01-29T11:00:00.000Z"
  }
}
```

### Error Responses

**Status Code:** `400 Bad Request`

```json
{
  "status": "error",
  "message": "Validation failed",
  "errorCode": "VALIDATION_ERROR",
  "data": {
    "validationErrors": [
      {
        "field": "object.min",
        "message": "At least one field must be provided for update"
      }
    ]
  }
}
```

**Status Code:** `404 Not Found`

```json
{
  "status": "error",
  "message": "Job profile with ID 999 not found",
  "errorCode": "JOB_PROFILE_NOT_FOUND"
}
```

---

## Delete Job Profile

Delete a job profile and its associated JD file.

**Endpoint:** `DELETE /:id`

### Path Parameters

| Parameter | Type    | Required | Description    |
| --------- | ------- | -------- | -------------- |
| id        | integer | Yes      | Job profile ID |

### Success Response

**Status Code:** `200 OK`

```json
{
  "status": "success",
  "message": "Job Profile deleted successfully",
  "data": null
}
```

### Error Response

**Status Code:** `404 Not Found`

```json
{
  "status": "error",
  "message": "Job profile with ID 999 not found",
  "errorCode": "JOB_PROFILE_NOT_FOUND"
}
```

---

## Upload JD File

Upload or replace a JD file for an existing job profile.

**Endpoint:** `POST /:id/upload-JD`

**Content-Type:** `multipart/form-data`

### Path Parameters

| Parameter | Type    | Required | Description    |
| --------- | ------- | -------- | -------------- |
| id        | integer | Yes      | Job profile ID |

### Request Body

| Field | Type | Required | Description                                       |
| ----- | ---- | -------- | ------------------------------------------------- |
| JD    | file | Yes      | Job description file (PDF, DOC, or DOCX, max 5MB) |

### Success Response

**Status Code:** `200 OK`

```json
{
  "status": "success",
  "message": "JD uploaded successfully",
  "data": {
    "jobProfileId": 1,
    "filename": "jd-descriptions/jobProfile_1_1234567890.pdf",
    "originalName": "job_description.pdf",
    "size": 524288,
    "location": "https://s3.amazonaws.com/bucket/jd-descriptions/jobProfile_1_1234567890.pdf",
    "uploadDate": "2026-01-29T10:30:00.000Z"
  }
}
```

### Error Responses

**Status Code:** `400 Bad Request`

```json
{
  "status": "error",
  "message": "No JD file uploaded",
  "errorCode": "NO_FILE_UPLOADED"
}
```

```json
{
  "status": "error",
  "message": "Only PDF, DOC and DOCX files are allowed",
  "errorCode": "INVALID_FILE_TYPE"
}
```

```json
{
  "status": "error",
  "message": "File too large. Maximum size is 5MB",
  "errorCode": "FILE_TOO_LARGE"
}
```

---

## Download JD File

Download the JD file for a job profile.

**Endpoint:** `GET /:id/get-JD`

### Path Parameters

| Parameter | Type    | Required | Description    |
| --------- | ------- | -------- | -------------- |
| id        | integer | Yes      | Job profile ID |

### Success Response

**Status Code:** `200 OK`

**Content-Type:** `application/pdf`, `application/msword`, or `application/vnd.openxmlformats-officedocument.wordprocessingml.document`

**Headers:**

- `Content-Disposition: attachment; filename="job_description.pdf"`
- `Content-Length: 524288`

**Body:** Binary file content

### Error Responses

**Status Code:** `404 Not Found`

```json
{
  "status": "error",
  "message": "No JD found for this Job Profile",
  "errorCode": "JD_NOT_FOUND"
}
```

```json
{
  "status": "error",
  "message": "JD file not found in storage",
  "errorCode": "JD_FILE_NOT_FOUND"
}
```

---

## Preview JD File

Preview a JD file in the browser (PDF only).

**Endpoint:** `GET /:id/get-JD/preview`

### Path Parameters

| Parameter | Type    | Required | Description    |
| --------- | ------- | -------- | -------------- |
| id        | integer | Yes      | Job profile ID |

### Success Response

**Status Code:** `200 OK`

**Content-Type:** `application/pdf`

**Headers:**

- `Content-Disposition: inline; filename="job_description.pdf"`
- `Content-Length: 524288`

**Body:** Binary file content

### Error Responses

**Status Code:** `400 Bad Request`

```json
{
  "status": "error",
  "message": "Preview is only supported for PDF files. Please download the file instead.",
  "errorCode": "PREVIEW_NOT_SUPPORTED",
  "data": {
    "fileType": ".docx",
    "supportedTypes": [".pdf"]
  }
}
```

**Status Code:** `404 Not Found`

```json
{
  "status": "error",
  "message": "No JD found for this Job Profile",
  "errorCode": "JD_NOT_FOUND"
}
```

---

## Delete JD File

Delete the JD file from a job profile (keeps the job profile).

**Endpoint:** `DELETE /:id/delete-JD`

### Path Parameters

| Parameter | Type    | Required | Description    |
| --------- | ------- | -------- | -------------- |
| id        | integer | Yes      | Job profile ID |

### Success Response

**Status Code:** `200 OK`

```json
{
  "status": "success",
  "message": "JD deleted successfully",
  "data": {
    "message": "JD deleted successfully",
    "deletedFile": "jd-descriptions/jobProfile_1_1234567890.pdf"
  }
}
```

### Error Response

**Status Code:** `404 Not Found`

```json
{
  "status": "error",
  "message": "No JD found for this Job Profile",
  "errorCode": "JD_NOT_FOUND"
}
```

---

## Get JD File Info

Get information about the JD file without downloading it.

**Endpoint:** `GET /:id/JD/info`

### Path Parameters

| Parameter | Type    | Required | Description    |
| --------- | ------- | -------- | -------------- |
| id        | integer | Yes      | Job profile ID |

### Success Response

**Status Code:** `200 OK`

```json
{
  "status": "success",
  "message": "JD information retrieved successfully",
  "data": {
    "hasJD": true,
    "originalName": "job_description.pdf",
    "uploadDate": "2026-01-29T10:30:00.000Z",
    "s3Key": "jd-descriptions/jobProfile_1_1234567890.pdf",
    "fileExtension": ".pdf",
    "mimeType": "application/pdf",
    "supportsPreview": true
  }
}
```

**When no JD exists:**

```json
{
  "status": "success",
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

## Structured Content Format

The `overview`, `responsibilities`, `requiredSkills`, and `niceToHave` fields support following formats:

```json
(Preferred Format):
{
"position": "Senior Full Stack Developer",
"experience": "5-7 years",
"experienceMinYears": 5,
"experienceMaxYears": 7,
"overview": {
"type": "paragraph",
"content": [
{
"id": "o_1",
"text": "We are seeking a talented Senior Full Stack Developer to join our engineering team."
},
{
"id": "o_2",
"text": "This role involves designing and developing scalable web applications using modern technologies."
}
]
},
"responsibilities": {
"type": "bullets",
"content": [
{
"id": "r_1",
"text": "Design and develop full-stack web applications using React and Node.js"
},
{
"id": "r_2",
"text": "Collaborate with cross-functional teams to define and implement new features"
},
{
"id": "r_3",
"text": "Write clean, maintainable, and well-documented code"
},
{
"id": "r_4",
"text": "Participate in code reviews and mentor junior developers"
}
]
},
"requiredSkills": {
"type": "bullets",
"content": [
{
"id": "s_1",
"text": "5+ years of experience in full-stack development"
},
{
"id": "s_2",
"text": "Expert knowledge of React, Node.js, and TypeScript"
},
{
"id": "s_3",
"text": "Experience with SQL and NoSQL databases"
},
{
"id": "s_4",
"text": "Strong understanding of RESTful APIs and microservices architecture"
}
]
},
"niceToHave": {
"type": "bullets",
"content": [
{
"id": "n_1",
"text": "Experience with AWS or Azure cloud platforms"
},
{
"id": "n_2",
"text": "Knowledge of Docker and Kubernetes"
}
]
},
"techSpecifications": "1, 2, 3"
}
```

```json
(Bullet format):
{
  "position": "DevOps Engineer",
  "experience": "3-5 years",
  "experienceMinYears": 3,
  "experienceMaxYears": 5,
  "overview": {
    "type": "paragraph",
    "content": [
      {
        "id": "o_1",
        "text": "We are looking for an experienced DevOps Engineer to manage our cloud infrastructure."
      }
    ]
  },
  "responsibilities": {
    "type": "bullets",
    "content": [
      {
        "id": "r_1",
        "text": "• Manage and optimize AWS infrastructure\n• Implement CI/CD pipelines\n• Monitor system performance and troubleshoot issues\n• Automate deployment processes"
      }
    ]
  },
  "requiredSkills": {
    "type": "bullets",
    "content": [
      {
        "id": "s_1",
        "text": "• Strong experience with AWS (EC2, S3, RDS, Lambda)\n• Proficiency in Docker and Kubernetes\n• Experience with Jenkins or GitLab CI\n• Knowledge of Infrastructure as Code (Terraform, CloudFormation)"
      }
    ]
  },
  "niceToHave": {
    "type": "bullets",
    "content": [
      {
        "id": "n_1",
        "text": "• Experience with monitoring tools like Prometheus and Grafana\n• Knowledge of security best practices"
      }
    ]
  }
}
```

````

**Note:** All structured content is converted to plain text on the backend. Bullet points are separated by newlines (`\n`), and paragraphs are separated by double newlines (`\n\n`).

---

## Technical Specifications Format

The `techSpecifications` field accepts:

### String (comma-separated IDs)

```json
{
  "techSpecifications": "1,2,3"
}
````

### Array of integers

```json
{
  "techSpecifications": [1, 2, 3]
}
```

Both formats are accepted and converted to an array of validated lookup IDs on the backend.

---

## Common Error Codes

| Error Code            | HTTP Status | Description                               |
| --------------------- | ----------- | ----------------------------------------- |
| VALIDATION_ERROR      | 400         | Request validation failed                 |
| DUPLICATE_JOB_ROLE    | 409         | Job profile with this role already exists |
| JOB_PROFILE_NOT_FOUND | 404         | Job profile not found                     |
| INVALID_TECH_SPEC     | 400         | Invalid technical specification ID        |
| NO_FILE_UPLOADED      | 400         | No file was uploaded                      |
| INVALID_FILE_TYPE     | 400         | Unsupported file type                     |
| FILE_TOO_LARGE        | 400         | File exceeds 5MB limit                    |
| JD_NOT_FOUND          | 404         | No JD file found for job profile          |
| JD_FILE_NOT_FOUND     | 404         | JD file not found in storage              |
| PREVIEW_NOT_SUPPORTED | 400         | Preview only supported for PDF files      |

---

# Job Profile Requirement API Documentation

API endpoints for managing job profile requirements, which represent client requests for specific job positions.

**Base URL:** `/api/jobProfileRequirement`

**Authentication:** All endpoints require authentication via the `authenticate` middleware.

---

## Table of Contents

- [Create Job Profile Requirement](#create-job-profile-requirement)
- [Get All Job Profile Requirements](#get-all-job-profile-requirements)
- [Get Job Profile Requirement by ID](#get-job-profile-requirement-by-id)
- [Update Job Profile Requirement](#update-job-profile-requirement)
- [Delete Job Profile Requirement](#delete-job-profile-requirement)

---

## Create Job Profile Requirement

Create a new job profile requirement for a client.

**Endpoint:** `POST /`

**Content-Type:** `application/json`

### Request Body

| Field              | Type    | Required | Description                                | Constraints                                        |
| ------------------ | ------- | -------- | ------------------------------------------ | -------------------------------------------------- |
| jobProfileId       | integer | Yes      | ID of the job profile                      | Positive integer                                   |
| clientId           | integer | Yes      | ID of the client                           | Positive integer                                   |
| departmentId       | integer | Yes      | ID of the department                       | Positive integer                                   |
| positions          | integer | Yes      | Number of positions to fill                | Positive integer                                   |
| estimatedCloseDate | string  | Yes      | Expected closing date                      | YYYY-MM-DD format, cannot be in the past           |
| workArrangement    | string  | Yes      | Work arrangement type                      | 'remote', 'onsite', or 'hybrid'                    |
| location           | object  | Yes      | Location details                           | See below                                          |
| location.country   | string  | Yes      | Country name                               | Lowercase                                          |
| location.city      | string  | Yes      | City name                                  | 2-100 characters                                   |
| status             | string  | No       | Requirement status (defaults to 'pending') | 'pending', 'in progress', 'closed', or 'cancelled' |

### Example Request

```json
{
  "jobProfileId": 1,
  "clientId": 5,
  "departmentId": 3,
  "positions": 10,
  "estimatedCloseDate": "2026-03-15",
  "workArrangement": "hybrid",
  "location": {
    "country": "india",
    "city": "Bangalore"
  },
  "status": "pending"
}
```

### Success Response

**Status Code:** `201 Created`

```json
{
  "status": "success",
  "message": "Job Profile Requirement created successfully",
  "data": {
    "jobProfileRequirementId": 1,
    "jobProfileId": 1,
    "jobRole": "Senior Software Engineer",
    "clientId": 5,
    "clientName": "Tech Corp",
    "departmentId": 3,
    "departmentName": "Engineering",
    "positions": 10,
    "receivedOn": "2026-01-29",
    "estimatedCloseDate": "2026-03-15",
    "workArrangement": "hybrid",
    "location": {
      "country": "india",
      "city": "Bangalore"
    },
    "status": "pending"
  }
}
```

### Error Responses

**Status Code:** `400 Bad Request`

```json
{
  "status": "error",
  "message": "Validation failed",
  "errorCode": "VALIDATION_ERROR",
  "data": {
    "validationErrors": [
      {
        "field": "jobProfileId",
        "message": "Job Profile ID is required"
      }
    ]
  }
}
```

**Status Code:** `404 Not Found`

```json
{
  "status": "error",
  "message": "Job profile with ID 999 does not exist",
  "errorCode": "JOB_PROFILE_NOT_FOUND",
  "data": {
    "field": "jobProfileId"
  }
}
```

**Status Code:** `409 Conflict`

```json
{
  "status": "error",
  "message": "A job profile requirement with this job profile already exists for this client and department",
  "errorCode": "DUPLICATE_JOB_REQUIREMENT"
}
```

---

## Get All Job Profile Requirements

Retrieve all job profile requirements.

**Endpoint:** `GET /`

### Success Response

**Status Code:** `200 OK`

```json
{
  "status": "success",
  "message": "Job Profile Requirements retrieved successfully",
  "data": [
    {
      "jobProfileRequirementId": 1,
      "jobProfileId": 1,
      "jobRole": "Senior Software Engineer",
      "clientId": 5,
      "clientName": "Tech Corp",
      "departmentId": 3,
      "departmentName": "Engineering",
      "positions": 10,
      "receivedOn": "2026-01-29",
      "estimatedCloseDate": "2026-03-15",
      "workArrangement": "hybrid",
      "location": {
        "country": "india",
        "city": "Bangalore"
      },
      "status": "pending"
    }
  ]
}
```

---

## Get Job Profile Requirement by ID

Retrieve a specific job profile requirement by ID.

**Endpoint:** `GET /:id`

### Path Parameters

| Parameter | Type    | Required | Description                |
| --------- | ------- | -------- | -------------------------- |
| id        | integer | Yes      | Job profile requirement ID |

### Success Response

**Status Code:** `200 OK`

```json
{
  "status": "success",
  "message": "Job Profile Requirement retrieved successfully",
  "data": {
    "jobProfileRequirementId": 1,
    "jobProfileId": 1,
    "jobRole": "Senior Software Engineer",
    "clientId": 5,
    "clientName": "Tech Corp",
    "departmentId": 3,
    "departmentName": "Engineering",
    "positions": 10,
    "receivedOn": "2026-01-29",
    "estimatedCloseDate": "2026-03-15",
    "workArrangement": "hybrid",
    "location": {
      "country": "india",
      "city": "Bangalore"
    },
    "status": "pending"
  }
}
```

### Error Response

**Status Code:** `404 Not Found`

```json
{
  "status": "error",
  "message": "Job profile requirement with ID 999 not found",
  "errorCode": "JOB_PROFILE_REQUIREMENT_NOT_FOUND"
}
```

---

## Update Job Profile Requirement

Update an existing job profile requirement.

**Endpoint:** `PATCH /:id`

**Content-Type:** `application/json`

### Path Parameters

| Parameter | Type    | Required | Description                |
| --------- | ------- | -------- | -------------------------- |
| id        | integer | Yes      | Job profile requirement ID |

### Request Body

All fields are optional. Only include fields you want to update.

| Field              | Type    | Description                 | Constraints                                        |
| ------------------ | ------- | --------------------------- | -------------------------------------------------- |
| jobProfileId       | integer | ID of the job profile       | Positive integer                                   |
| positions          | integer | Number of positions to fill | Positive integer                                   |
| estimatedCloseDate | string  | Expected closing date       | YYYY-MM-DD format, cannot be in the past           |
| workArrangement    | string  | Work arrangement type       | 'remote', 'onsite', or 'hybrid'                    |
| location           | object  | Location details            | See below                                          |
| location.country   | string  | Country name                | Lowercase                                          |
| location.city      | string  | City name                   | 2-100 characters                                   |
| status             | string  | Requirement status          | 'pending', 'in progress', 'closed', or 'cancelled' |

### Example Request

```json
{
  "positions": 15,
  "status": "in progress",
  "estimatedCloseDate": "2026-04-30"
}
```

### Success Response

**Status Code:** `200 OK`

```json
{
  "status": "success",
  "message": "Job Profile Requirement updated successfully",
  "data": {
    "jobProfileRequirementId": 1,
    "jobProfileId": 1,
    "jobRole": "Senior Software Engineer",
    "clientId": 5,
    "clientName": "Tech Corp",
    "departmentId": 3,
    "departmentName": "Engineering",
    "positions": 15,
    "receivedOn": "2026-01-29",
    "estimatedCloseDate": "2026-04-30",
    "workArrangement": "hybrid",
    "location": {
      "country": "india",
      "city": "Bangalore"
    },
    "status": "in progress"
  }
}
```

### Error Responses

**Status Code:** `400 Bad Request`

```json
{
  "status": "error",
  "message": "Cannot update a job profile requirement that is closed",
  "errorCode": "JOB_PROFILE_REQUIREMENT_UPDATE_NOT_ALLOWED"
}
```

```json
{
  "status": "error",
  "message": "Validation failed",
  "errorCode": "VALIDATION_ERROR",
  "data": {
    "validationErrors": [
      {
        "field": "object.min",
        "message": "At least one field must be provided for update"
      }
    ]
  }
}
```

**Status Code:** `404 Not Found`

```json
{
  "status": "error",
  "message": "Job profile requirement with ID 999 not found",
  "errorCode": "JOB_PROFILE_REQUIREMENT_NOT_FOUND"
}
```

---

## Delete Job Profile Requirement

Delete a job profile requirement.

**Endpoint:** `DELETE /:id`

### Path Parameters

| Parameter | Type    | Required | Description                |
| --------- | ------- | -------- | -------------------------- |
| id        | integer | Yes      | Job profile requirement ID |

### Success Response

**Status Code:** `200 OK`

```json
{
  "status": "success",
  "message": "Job Profile Requirement deleted successfully",
  "data": null
}
```

### Error Response

**Status Code:** `404 Not Found`

```json
{
  "status": "error",
  "message": "Job profile requirement with ID 999 not found",
  "errorCode": "JOB_PROFILE_REQUIREMENT_NOT_FOUND"
}
```

---

## Location Object Format

The `location` field in requests accepts an object with the following structure:

```json
{
  "country": "india",
  "city": "Bangalore"
}
```

**Notes:**

- Both `country` and `city` are required when creating a requirement
- When updating, at least one field (`country` or `city`) must be provided
- City names are validated against the `location` table in the database
- Country values should be lowercase

---

## Status Values

Valid status values (case-insensitive):

- `pending` - Default status for new requirements
- `in progress` - Actively being worked on
- `closed` - Successfully filled
- `cancelled` - No longer needed

**Note:** Requirements with status `closed` or `cancelled` cannot be updated.

---

## Work Arrangement Values

Valid work arrangement values (case-insensitive):

- `remote` - Fully remote position
- `onsite` - On-site only position
- `hybrid` - Mix of remote and on-site work

---

## Common Error Codes

| Error Code                                 | HTTP Status | Description                                    |
| ------------------------------------------ | ----------- | ---------------------------------------------- |
| VALIDATION_ERROR                           | 400         | Request validation failed                      |
| SEARCH_VALIDATION_ERROR                    | 400         | Search parameters validation failed            |
| INVALID_REQUEST                            | 400         | Missing or invalid request data                |
| JOB_PROFILE_NOT_FOUND                      | 404         | Referenced job profile does not exist          |
| INVALID_LOCATION                           | 400         | Invalid location/city name                     |
| INVALID_STATUS                             | 400         | Invalid status value                           |
| JOB_PROFILE_REQUIREMENT_NOT_FOUND          | 404         | Job profile requirement not found              |
| JOB_PROFILE_REQUIREMENT_UPDATE_NOT_ALLOWED | 400         | Cannot update closed or cancelled requirements |
| BULK_UPDATE_ERROR                          | 400         | Some records failed during bulk update         |

---

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
      "jobProfileRequirementId": 1,
      "jobRole": "SDE",
      "preferredJobLocation": {
        "city": "Ahemedabad",
        "country": "India"
      },
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
      "jobProfileRequirementId": 1,
      "jobRole": "Software Devloper",
      "preferredJobLocation": {
        "city": "Ahemedabad",
        "country": "India"
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
    "jobProfileRequirementId": 1,
    "jobRole": "SDE-2",
    "expectedLocation": {
      "city": "Ahemedabad",
      "country": "India"
    },
    "currentLocation": {
      "city": "Ahemedabad",
      "country": "India"
    },
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
    ],
    "jobProfiles": [
      {
        "jobProfileRequirementId": 30,
        "positions": 1,
        "receivedOn": "2025-12-16 11:19:37",
        "estimatedCloseDate": "2025-12-24 00:00:00",
        "jobProfileId": 9,
        "jobRole": "Backend dev",
        "experienceText": null,
        "experienceMinYears": null,
        "experienceMaxYears": null,
        "clientId": 4,
        "clientName": "Google ( Alphabet ) Test",
        "departmentId": 83,
        "departmentName": "check",
        "locationId": 1,
        "city": "Ahmedabad",
        "state": "Gujarat",
        "country": "India",
        "statusId": 4,
        "statusName": "In Progress"
      },
      {
        "jobProfileRequirementId": 29,
        "positions": 1,
        "receivedOn": "2025-12-16 11:07:23",
        "estimatedCloseDate": "2025-12-24 00:00:00",
        "jobProfileId": 8,
        "jobRole": "Backend Engineer",
        "experienceText": null,
        "experienceMinYears": null,
        "experienceMaxYears": null,
        "clientId": 4,
        "clientName": "Google ( Alphabet ) Test",
        "departmentId": 83,
        "departmentName": "check",
        "locationId": 1,
        "city": "Ahmedabad",
        "state": "Gujarat",
        "country": "India",
        "statusId": 4,
        "statusName": "In Progress"
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

| Field                   | Type        | Description                                                                     |
| ----------------------- | ----------- | ------------------------------------------------------------------------------- |
| candidateName           | String      | Candidate full name (required)                                                  |
| contactNumber           | String      | Phone number (optional)                                                         |
| email                   | String      | Email address (optional)                                                        |
| recruiterId             | String      | Recruiter Id (required) [must be in member table]                               |
| jobRole                 | String      | Job title (optional, soon to be depricated)                                     |
| jobProfileRequirementId | Number      | Job Profile Requirement Id (required) [must be in jobProfile Requirement table] |
| expectedLocation        | JSON Object | must be a json object with city and country attributes (required)               |
| currentCTC              | Number      | Current CTC in INR [supports decimals ie 12.5] (optional)                       |
| expectedCTC             | Number      | Expected CTC in INR [supports decimal ie 12.5] (optional)                       |
| noticePeriod            | Number      | Notice period in days (required)                                                |
| experienceYears         | Number      | Years of experience (required) [supports decimal]                               |
| linkedinProfileUrl      | String      | LinkedIn URL (optional)                                                         |
| resume                  | File        | PDF resume, max 5MB (optional)                                                  |
| notes                   | string      | notes about candidates (optional)                                               |

**Response:**

```json
{
  "success": true,
  "message": "Candidate created successfully",
  "data": {
    "candidateId": 81,
    "candidateName": "Pedri Gonzales",
    "recruiterId": 1,
    "appliedForJobProfileId": 28,
    "expectedLocation": 1,
    "noticePeriod": 30,
    "experienceYears": 2.2,
    "statusId": 9,
    "createdOn": "2026-01-20T12:05:03.201Z"
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
| jobRole | String | Job title (optional) [soon to be depricated] |
| jobProfileRequirementId | Number | job profile Requirement ID must be in jobProfileRequirementTable |
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

### Upload Candidates in Bulk

```
POST /candidate/bulk-upload
```

**Content-Type:** `multipart/form-data`

**Authentication:** Required (Bearer token)

---

## Request

### Form Data

| Field | Type | Required | Description                                 |
| ----- | ---- | -------- | ------------------------------------------- |
| file  | File | Yes      | CSV or Excel file (`.csv`, `.xlsx`, `.xls`) |

### File Requirements

- **Max file size:** 10 MB
- **Max rows:** 50,000 candidates
- **Supported formats:** CSV, XLSX, XLS
- **Encoding:** UTF-8 (for CSV)

---

## CSV Format

### Required Columns

| Column Name      | Type   | Required | Description                                      | Example                    |
| ---------------- | ------ | -------- | ------------------------------------------------ | -------------------------- |
| candidate_name   | String | ✅ Yes   | Full name (2-100 chars, letters/spaces/.-' only) | `John Doe`                 |
| recruiter_name   | String | ✅ Yes   | Recruiter name (must exist in system)            | `Jayraj`                   |
| client_name      | String | ✅ Yes   | Client name (must exist in system)               | `TCS`                      |
| department_name  | String | ✅ Yes   | Department name (must exist in system)           | `Engineering`              |
| job_role         | String | ✅ Yes   | Job role (must match active requirement)         | `Senior Software Engineer` |
| expected_city    | String | ✅ Yes   | Preferred work location                          | `Bangalore`                |
| notice_period    | Number | ✅ Yes   | Notice period in days (0-365)                    | `30`                       |
| experience_years | Number | ✅ Yes   | Years of experience (0-50, supports decimals)    | `5.5`                      |

### Optional Columns

| Column Name    | Type   | Required | Description                                          | Example                           |
| -------------- | ------ | -------- | ---------------------------------------------------- | --------------------------------- |
| email          | String | ❌ No    | Email address (valid format)                         | `john.doe@example.com`            |
| contact_number | String | ❌ No    | Phone number (7-25 chars, +/digits/spaces/()-)       | `+91-9876543210`                  |
| current_city   | String | ❌ No    | Current location                                     | `Ahmedabad`                       |
| current_ctc    | Number | ❌ No    | Current CTC in INR (0-10,000,000, supports decimals) | `1200000`                         |
| expected_ctc   | Number | ❌ No    | Expected CTC in INR (must be ≥ current CTC)          | `1500000`                         |
| linkedin_url   | String | ❌ No    | LinkedIn profile URL (valid format)                  | `https://linkedin.com/in/johndoe` |
| notes          | String | ❌ No    | Additional notes/comments                            | `Strong React skills`             |

### Column Name Variations

The system accepts flexible column naming (case-insensitive, with underscores or spaces):

- **candidate_name:** `name`, `full_name`, `candidatename`
- **recruiter_name:** `recruiter`, `recruitername`
- **client_name:** `client`, `clientname`
- **department_name:** `department`, `departmentname`
- **job_role:** `role`, `position`, `jobrole`
- **contact_number:** `phone`, `mobile`, `contact`, `contactnumber`
- **current_city:** `current_location`, `city`, `currentcity`
- **expected_city:** `preferred_city`, `expected_location`, `expectedcity`
- **current_ctc:** `currentctc`, `current_salary`
- **expected_ctc:** `expectedctc`, `expected_salary`
- **notice_period:** `notice`, `noticeperiod`
- **experience_years:** `experience`, `exp`, `experienceyears`
- **linkedin_url:** `linkedin`, `linkedinprofileurl`

---

## Sample CSV File

```csv
candidate_name,email,contact_number,recruiter_name,client_name,department_name,job_role,current_city,expected_city,current_ctc,expected_ctc,notice_period,experience_years,linkedin_url,notes
John Doe,john.doe@example.com,+91-9876543210,Jayraj,TCS,Engineering,Senior Software Engineer,Ahmedabad,Bangalore,1200000,1500000,30,5.5,https://linkedin.com/in/johndoe,Strong React and Node.js skills
Jane Smith,jane.smith@example.com,+91-9876543211,Khushi,Infosys,Marketing,Product Manager,Mumbai,Bangalore,1800000,2200000,60,7,https://linkedin.com/in/janesmith,Excellent product vision
Raj Patel,raj.patel@example.com,+91-9876543212,Yash,Wipro,Engineering,Backend Developer,Pune,Ahmedabad,900000,1100000,15,3.5,https://linkedin.com/in/rajpatel,Expert in Java
```

---

## Response Format

### Success Response (All Records Inserted)

**Status Code:** `201 Created`

```json
{
  "success": true,
  "message": "Bulk upload completed",
  "data": {
    "summary": {
      "totalRows": 10,
      "inserted": 10,
      "failed": 0,
      "skipped": 0,
      "processingTime": "2.34s"
    },
    "failedRows": [],
    "hasMoreErrors": false
  }
}
```

### Partial Success Response (Some Failures)

**Status Code:** `207 Multi-Status`

```json
{
  "success": true,
  "message": "Bulk upload completed",
  "data": {
    "summary": {
      "totalRows": 10,
      "inserted": 7,
      "failed": 3,
      "skipped": 0,
      "processingTime": "2.15s"
    },
    "failedRows": [
      {
        "row": 3,
        "error": "Duplicate email: existing@example.com"
      },
      {
        "row": 5,
        "error": "Recruiter 'InvalidName' not found"
      },
      {
        "row": 8,
        "error": "No active job requirement found for Client: 'ABC Corp', Department: 'Sales', Role: 'Manager'"
      }
    ],
    "hasMoreErrors": false
  }
}
```

### Response Fields

| Field                    | Type    | Description                                            |
| ------------------------ | ------- | ------------------------------------------------------ |
| `summary.totalRows`      | Number  | Total number of data rows processed (excludes header)  |
| `summary.inserted`       | Number  | Number of candidates successfully created              |
| `summary.failed`         | Number  | Number of rows that failed validation/insertion        |
| `summary.skipped`        | Number  | Number of rows skipped (reserved for future use)       |
| `summary.processingTime` | String  | Total processing time in seconds                       |
| `failedRows`             | Array   | List of failed rows with error details (max 100 shown) |
| `failedRows[].row`       | Number  | Row number in the file (1-indexed, includes header)    |
| `failedRows[].error`     | String  | Specific error message for that row                    |
| `hasMoreErrors`          | Boolean | `true` if more than 100 errors occurred                |

---

## Error Responses

### File Validation Errors

**Status Code:** `400 Bad Request`

```json
{
  "success": false,
  "message": "Invalid file format. Only CSV and Excel files are allowed.",
  "error": {
    "code": "INVALID_FILE_FORMAT"
  }
}
```

**Common File Errors:**

| Error Code            | Description                         |
| --------------------- | ----------------------------------- |
| `NO_FILE_UPLOADED`    | No file provided in request         |
| `INVALID_FILE_FORMAT` | File is not CSV or Excel            |
| `FILE_TOO_LARGE`      | File exceeds 10 MB limit            |
| `ROW_LIMIT_EXCEEDED`  | File contains more than 50,000 rows |

### Row Validation Errors

These errors appear in the `failedRows` array:

| Error Type                 | Example Message                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| **Missing Required Field** | `"Candidate name is required"`                                                           |
| **Invalid Format**         | `"Email must be a valid email address"`                                                  |
| **Out of Range**           | `"Experience years cannot exceed 50"`                                                    |
| **Duplicate Entry**        | `"Duplicate email: john@example.com"`                                                    |
| **Not Found**              | `"Recruiter 'John Smith' not found"`                                                     |
| **Job Requirement**        | `"No active job requirement found for Client: 'TCS', Department: 'HR', Role: 'Manager'"` |
| **CTC Validation**         | `"Expected CTC should not be less than current CTC"`                                     |
| **LinkedIn URL**           | `"LinkedIn URL must be in format: https://linkedin.com/in/username"`                     |

---

## Validation Rules

### Field-Specific Rules

#### candidate_name

- ✅ Required
- Min length: 2 characters
- Max length: 100 characters
- Allowed: Letters, spaces, periods (.), hyphens (-), apostrophes (')
- ❌ Invalid: `J` (too short), `John123` (contains numbers)

#### email

- Optional
- Must be valid email format
- Max length: 255 characters
- Automatically converted to lowercase
- Must be unique (no duplicates in database)
- ❌ Invalid: `notanemail`, `user@`, `@domain.com`

#### contact_number

- Optional
- Length: 7-25 characters
- Allowed: Digits, spaces, `+`, `-`, `(`, `)`
- Must be unique (no duplicates in database)
- ❌ Invalid: `123` (too short), `abc-1234567` (contains letters)

#### recruiter_name

- ✅ Required
- Must match an existing recruiter in the system
- Case-insensitive matching
- ❌ Invalid: Non-existent recruiter name

#### client_name, department_name, job_role

- ✅ All three required (used to identify job requirement)
- Must match an existing active job profile requirement
- Active requirement = status is "Pending" or "In Progress"
- Matching is case-insensitive
- ❌ Invalid: If no matching active requirement exists

#### current_city / expected_city

- expected_city: ✅ Required
- current_city: Optional
- Must exist in the locations table
- Case-insensitive matching
- ❌ Invalid: City not in system

#### current_ctc / expected_ctc

- Optional
- Range: 0 to 10,000,000
- Supports decimals (up to 2 decimal places)
- Validation: `expected_ctc` must be ≥ `current_ctc`
- ❌ Invalid: `expected_ctc: 800000, current_ctc: 1000000`

#### notice_period

- ✅ Required
- Range: 0 to 365 days
- Must be a whole number
- ❌ Invalid: `-10`, `400`, `30.5`

#### experience_years

- ✅ Required
- Range: 0 to 50 years
- Supports decimals (e.g., `5.5` for 5.5 years)
- ❌ Invalid: `-1`, `60`, `abc`

#### linkedin_url

- Optional
- Must be a valid HTTPS/HTTP URL
- Must match pattern: `https://linkedin.com/in/username`
- Max length: 500 characters
- ❌ Invalid: `https://twitter.com/user`, `linkedin.com/in/user` (missing https)

---

## Processing Details

### Batch Processing

- Records are processed in **batches of 200** for optimal database performance
- Each batch is inserted in a single transaction
- If a batch fails, the entire batch is rolled back
- Successfully processed batches remain committed

### Transaction Safety

- Each upload runs in a database transaction
- If any critical error occurs, all changes are rolled back
- Row-level validation errors don't roll back the entire upload
- Only valid rows are inserted

### Duplicate Detection

- **Email uniqueness:** Checked against existing candidates in database
- **Contact number uniqueness:** Checked against existing candidates
- **Within file:** Duplicates within the same CSV are also caught
- Failed duplicates are reported in `failedRows`

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

````

/api/member

```

All endpoints require authentication.

---

## 🔐 Authentication

All routes require a valid authenticated token.

```

Authorization: Bearer <token>

````

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

# Interview Management API

A comprehensive REST API for managing interview scheduling, tracking, and reporting with timezone support and conflict detection.

## Table of Contents

- [Authentication](#authentication)
- [Endpoints](#endpoints)
  - [Get All Interviews](#get-all-interviews)
  - [Get Interview by ID](#get-interview-by-id)
  - [Get Interviews by Candidate](#get-interviews-by-candidate)
  - [Get Create Form Data](#get-create-form-data)
  - [Get Finalize Form Data](#get-finalize-form-data)
  - [Create Interview](#create-interview)
  - [Schedule Next Round](#schedule-next-round)
  - [Update Interview](#update-interview)
  - [Finalize Interview](#finalize-interview)
  - [Delete Interview](#delete-interview)
  - [Get Interview Tracker](#get-interview-tracker)
  - [Get Overall Summary](#get-overall-summary)
  - [Get Monthly Summary](#get-monthly-summary)
  - [Get Daily Summary](#get-daily-summary)
- [Error Responses](#error-responses)

---

## Authentication

All endpoints require authentication via Bearer token.

```http
Authorization: Bearer <your-token>
```

---

## Endpoints

### Get All Interviews

Retrieve all active interviews.

**Endpoint:** `GET /interview`

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
      "interviewDate": "2026-01-15",
      "fromTime": "2026-01-15T09:00:00.000Z",
      "toTime": "2026-01-15T10:00:00.000Z",
      "eventTimezone": "Asia/Kolkata",
      "eventTimestamp": "2025-12-15T14:30:00.000+05:30",
      "candidateIsActive": 0,
      "candidateIsDeleted": 1,
      "durationMinutes": 60,
      "candidateId": 5,
      "candidateName": "John Doe",
      "interviewerId": 3,
      "interviewerName": "Jane Smith",
      "scheduledById": 2,
      "scheduledByName": "HR Manager",
      "result": "Pending",
      "recruiterNotes": "Technical round",
      "interviewerFeedback": null,
      "meetingUrl": "https://meet.example.com/interview-123",
      "isActive": true
    }
  ]
}
```

---

### Get Interview by ID

Retrieve a specific interview by its ID.

**Endpoint:** `GET /interview/:interviewId`

**Parameters:**

- `interviewId` (path) - Interview ID (positive integer)

**Response:**

```json
{
  "success": true,
  "message": "Interview entry retrieved successfully",
  "data": {
    "interviewId": 1,
    "roundNumber": 1,
    "totalInterviews": 2,
    "interviewDate": "2026-01-15",
    "fromTime": "2026-01-15T09:00:00.000Z",
    "toTime": "2026-01-15T10:00:00.000Z",
    "eventTimezone": "Asia/Kolkata",
    "eventTimestamp": "2025-12-15T14:30:00.000+05:30",
    "candidateIsActive": 0,
    "candidateIsDeleted": 1,
    "durationMinutes": 60,
    "candidateId": 5,
    "candidateName": "John Doe",
    "interviewerId": 3,
    "interviewerName": "Jane Smith",
    "scheduledById": 2,
    "scheduledByName": "HR Manager",
    "result": "Pending",
    "recruiterNotes": "Technical round",
    "interviewerFeedback": null,
    "meetingUrl": "https://meet.example.com/interview-123"
  }
}
```

---

### Get Interviews by Candidate

Retrieve all interviews for a specific candidate.

**Endpoint:** `GET /interview/candidate/:candidateId`

**Parameters:**

- `candidateId` (path) - Candidate ID (positive integer)

**Response:**

```json
{
  "success": true,
  "message": "Candidate interviews retrieved successfully",
  "data": {
    "candidateId": 5,
    "totalRounds": 2,
    "data": [
      {
        "interviewId": 1,
        "roundNumber": 1,
        "totalInterviews": 2,
        "interviewDate": "2026-01-15",
        "fromTime": "2026-01-15T09:00:00.000Z",
        "toTime": "2026-01-15T10:00:00.000Z",
        "eventTimezone": "Asia/Kolkata",
        "eventTimestamp": "2025-12-15T14:30:00.000+05:30",
        "durationMinutes": 60,
        "result": "Selected",
        "meetingUrl": "https://meet.example.com/interview-123",
        "interviewerId": 3,
        "interviewerName": "Jane Smith"
      },
      {
        "interviewId": 2,
        "roundNumber": 2,
        "totalInterviews": 2,
        "interviewDate": "2026-01-20",
        "fromTime": "2026-01-20T14:00:00.000Z",
        "toTime": "2026-01-20T15:30:00.000Z",
        "eventTimezone": "Asia/Kolkata",
        "eventTimestamp": "2025-12-15T14:30:00.000+05:30",
        "durationMinutes": 90,
        "result": "Pending",
        "meetingUrl": null,
        "interviewerId": 4,
        "interviewerName": "Bob Johnson"
      }
    ]
  }
}
```

---

### Get Create Form Data

Retrieve data needed for the interview creation form.

**Endpoint:** `GET /interview/create-data`

**Response:**

```json
{
  "success": true,
  "message": "Interview Form Data retrieved successfully",
  "data": {
    "interviewers": [
      {
        "interviewerId": 3,
        "interviewerName": "Jane Smith"
      },
      {
        "interviewerId": 4,
        "interviewerName": "Bob Johnson"
      }
    ],
    "recruiters": [
      {
        "recruiterId": 2,
        "recruiterName": "HR Manager"
      }
    ]
  }
}
```

---

### Get Finalize Form Data

Retrieve current data for finalizing an interview.

**Endpoint:** `GET /interview/:interviewId/finalize-data`

**Parameters:**

- `interviewId` (path) - Interview ID (positive integer)

**Response:**

```json
{
  "success": true,
  "message": "Finalize Interview Form Data retrieved successfully",
  "data": {
    "interviewId": 1,
    "result": "pending",
    "recruiterNotes": "Technical round",
    "interviewerFeedback": null,
    "meetingUrl": "https://meet.example.com/interview-123"
  }
}
```

---

### Create Interview

Create a new interview for a candidate.

**Endpoint:** `POST /interview/:candidateId`

**Parameters:**

- `candidateId` (path) - Candidate ID (positive integer)

**Request Body:**

```json
{
  "interviewDate": "2026-01-15",
  "fromTime": "09:00",
  "durationMinutes": 60,
  "eventTimezone": "Asia/Kolkata",
  "interviewerId": 3,
  "scheduledById": 2,
  "result": "pending",
  "recruiterNotes": "Technical round - focus on algorithms",
  "interviewerFeedback": null
}
```

**Validation Rules:**

- `interviewDate`: Required, format YYYY-MM-DD
- `fromTime`: Required, format HH:MM (00:00-23:59)
- `durationMinutes`: Required, integer, min 15, max 480
- `eventTimezone`: Required, valid IANA timezone (e.g., Asia/Kolkata)
- `interviewerId`: Required, positive integer
- `scheduledById`: Required, positive integer
- `result`: Optional, one of: pending, selected, rejected, cancelled (default: pending)
- `recruiterNotes`: Optional, max 1000 characters
- `interviewerFeedback`: Optional, max 2000 characters

**Response:**

```json
{
  "success": true,
  "message": "interview created successfully",
  "data": {
    "interviewId": 1,
    "roundNumber": 1,
    "totalInterviews": 1,
    "interviewDate": "2026-01-15",
    "fromTime": "2026-01-15T09:00:00.000Z",
    "toTime": "2026-01-15T10:00:00.000Z",
    "durationMinutes": 60,
    "candidateId": 5,
    "candidateName": "John Doe",
    "interviewerId": 3,
    "interviewerName": "Jane Smith",
    "scheduledById": 2,
    "scheduledByName": "HR Manager",
    "result": "Pending",
    "recruiterNotes": "Technical round - focus on algorithms",
    "interviewerFeedback": null
  }
}
```

---

### Schedule Next Round

Schedule an additional interview round for a candidate.

**Endpoint:** `POST /interview/:candidateId/rounds`

**Parameters:**

- `candidateId` (path) - Candidate ID (positive integer)

**Request Body:**

```json
{
  "interviewDate": "2026-01-20",
  "fromTime": "14:00",
  "durationMinutes": 90,
  "eventTimezone": "Asia/Kolkata",
  "interviewerId": 4,
  "scheduledById": 2
}
```

**Validation Rules:**

- Same as Create Interview, but without optional fields (result, notes, feedback)
- Requires at least one previous interview for the candidate

**Response:**

```json
{
  "success": true,
  "message": "Successfully scheduled round 2 for candidate",
  "data": {
    "interviewId": 2,
    "roundNumber": 2,
    "totalInterviews": 2,
    "interviewDate": "2026-01-20",
    "fromTime": "2026-01-20T14:00:00.000Z",
    "toTime": "2026-01-20T15:30:00.000Z",
    "durationMinutes": 90,
    "candidateId": 5,
    "candidateName": "John Doe",
    "interviewerId": 4,
    "interviewerName": "Bob Johnson",
    "scheduledById": 2,
    "scheduledByName": "HR Manager",
    "result": "Pending",
    "recruiterNotes": null,
    "interviewerFeedback": null
  }
}
```

---

### Update Interview

Update interview details. When updating time-related fields, all three (interviewDate, fromTime, eventTimezone) must be provided together.

**Endpoint:** `PATCH /interview/:interviewId`

**Parameters:**

- `interviewId` (path) - Interview ID (positive integer)

**Request Body:**

```json
{
  "interviewDate": "2026-01-16",
  "fromTime": "10:00",
  "eventTimezone": "Asia/Kolkata",
  "durationMinutes": 90,
  "interviewerId": 4
}
```

**Validation Rules:**

- At least one field must be provided
- If updating time: `interviewDate`, `fromTime`, and `eventTimezone` are all required together
- `durationMinutes`: Optional, integer, min 15, max 480
- `interviewerId`: Optional, positive integer
- `scheduledById`: Optional, positive integer

**Response:**

```json
{
  "success": true,
  "message": "Interview entry updated successfully",
  "data": {
    "interviewId": 1,
    "candidateId": 5,
    "interviewDate": "2026-01-16",
    "fromTime": "10:00",
    "eventTimezone": "Asia/Kolkata",
    "durationMinutes": 90,
    "interviewerId": 4
  }
}
```

---

### Finalize Interview

Update interview result and feedback.

**Endpoint:** `PUT /interview/:interviewId/finalize`

**Parameters:**

- `interviewId` (path) - Interview ID (positive integer)

**Request Body:**

```json
{
  "result": "Selected",
  "recruiterNotes": "Strong technical skills",
  "interviewerFeedback": "Excellent problem-solving abilities. Recommend for next round.",
  "meetingUrl": "https://meet.example.com/interview-123"
}
```

**Validation Rules:**

- `result`: Required, one of: Pending, Selected, Rejected, Cancelled
- `recruiterNotes`: Optional, max 1000 characters
- `interviewerFeedback`: Optional, max 2000 characters
- `meetingUrl`: Optional, must be HTTPS URL, max 2048 characters

**Response:**

```json
{
  "success": true,
  "message": "Interview finalized successfully",
  "data": {
    "interviewId": 1,
    "result": "Selected",
    "recruiterNotes": "Strong technical skills",
    "interviewerFeedback": "Excellent problem-solving abilities. Recommend for next round.",
    "meetingUrl": "https://meet.example.com/interview-123"
  }
}
```

---

### Delete Interview

Soft delete an interview. Automatically renumbers remaining rounds for the candidate.

**Endpoint:** `DELETE /interview/:interviewId`

**Parameters:**

- `interviewId` (path) - Interview ID (positive integer)

**Response:**

```json
{
  "success": true,
  "message": "Interview entry deleted successfully",
  "data": null
}
```

---

### Get Interview Tracker

Filter and track interviews by various criteria.

**Endpoint:** `GET /interview/report/tracker`

**Query Parameters:**

- `filter` (required): One of `today`, `past7days`, `custom`
- `startDate` (required if filter=custom): Format YYYY-MM-DD
- `endDate` (required if filter=custom): Format YYYY-MM-DD (must be >= startDate)
- `timezone` (Required) should be in IANA Format
- `interviewerId` (optional): Filter by interviewer ID
- `result` (optional): Filter by result (pending, selected, rejected, cancelled)
- `candidateId` (optional): Filter by candidate ID

**Example Request:**

```http
GET /interview/report/tracker?filter=custom&startDate=2026-01-01&endDate=2026-01-31&result=selected&timezone=Asia/Kolkata
```

**Response:**

```json
{
  "success": true,
  "message": "Interview tracker data retrieved successfully",
  "data": [
    {
      "interviewDate": "2026-01-15",
      "interviewFromTime": "2026-01-15T09:00:00.000Z",
      "interviewerFeedback": "Excellent problem-solving skills",
      "candidateId": 5,
      "candidateName": "John Doe",
      "candidatePhone": "+1234567890",
      "candidateEmail": "john.doe@example.com",
      "jobRole": "Software Engineer",
      "experienceYears": 3,
      "noticePeriod": 30,
      "expectedJoiningLocation": {
        "locationId": 1,
        "city": "Bangalore",
        "state": "Karnataka",
        "country": "India"
      },
      "interviewerId": 3,
      "interviewerName": "Jane Smith",
      "recruiterName": "HR Manager"
    }
  ]
}
```

---

### Get Overall Summary

Get overall interview statistics grouped by interviewer.

**Endpoint:** `GET /interview/report/overall`

**Response:**

```json
{
  "success": true,
  "message": "Total Interviewer Data Retrieved Successfully",
  "data": {
    "interviewers": [
      {
        "interviewerId": 3,
        "interviewerName": "Jane Smith",
        "total": 15,
        "selected": 8,
        "rejected": 5,
        "pending": 2,
        "cancelled": 0,
        "avgDuration": 67.5,
        "totalMinutes": 1012.5
      },
      {
        "interviewerId": 4,
        "interviewerName": "Bob Johnson",
        "total": 12,
        "selected": 6,
        "rejected": 4,
        "pending": 1,
        "cancelled": 1,
        "avgDuration": 75.0,
        "totalMinutes": 900
      }
    ]
  }
}
```

---

### Get Monthly Summary

Get interview statistics for a specific date range, grouped by interviewer.

**Endpoint:** `GET /interview/report/monthly`

**Query Parameters:**

- `startDate` (required): Format YYYY-MM-DD
- `endDate` (required): Format YYYY-MM-DD (must be > startDate)
- `timezone` (Required) should be in IANA Format

**Example Request:**

```http
GET /interview/report/monthly?startDate=2026-01-01&endDate=2026-01-31&timezone=Asia/Kolkata
```

**Response:**

```json
{
  "success": true,
  "message": "Total Monthly Summary Data Retrieved Successfully",
  "data": {
    "summary": {
      "total": 27,
      "selected": 14,
      "rejected": 9,
      "pending": 3,
      "cancelled": 1
    },
    "interviewers": [
      {
        "interviewerId": 3,
        "interviewerName": "Jane Smith",
        "total": 15,
        "selected": 8,
        "rejected": 5,
        "pending": 2,
        "cancelled": 0,
        "avgDuration": 67.5,
        "totalMinutes": 1012.5
      }
    ],
    "interviewTimeStamp": [
      {
        "interviewTimeStamp": "2025-12-05 09:00:00.000000"
      },
      {
        "interviewTimeStamp": "2025-12-10 09:00:00.000000"
      },
      {
        "interviewTimeStamp": "2025-12-15 09:00:00.000000"
      },
      {
        "interviewTimeStamp": "2025-12-15 13:00:00.000000"
      },
      {
        "interviewTimeStamp": "2025-12-22 11:00:00.000000"
      },
      {
        "interviewTimeStamp": "2025-12-23 11:00:00.000000"
      },
      {
        "interviewTimeStamp": "2025-12-26 10:30:00.000000"
      },
      {
        "interviewTimeStamp": "2025-12-27 11:00:00.000000"
      },
      {
        "interviewTimeStamp": "2026-01-06 10:00:00.000000"
      }
    ]
  }
}
```

---

### Get Daily Summary

Get all interviews scheduled for a specific date.

**Endpoint:** `GET /interview/report/daily`

**Query Parameters:**

- `date` (required): Format YYYY-MM-DD
- `timezone` (Required) should be in IANA Format

**Example Request:**

```http
GET /interview/report/daily?date=2026-01-15&timezone=Asia/Kolkata
```

**Response:**

```json
{
  "success": true,
  "message": "Total Daily Summary Data Retrieved Sucessfully",
  "data": {
    "interviews": [
      {
        "interviewerId": 3,
        "interviewerName": "Jane Smith",
        "interviewId": 1,
        "candidateId": 5,
        "candidateName": "John Doe",
        "interviewDate": "2026-01-15",
        "fromTime": "2026-01-15T09:00:00.000Z",
        "toTime": "2026-01-15T10:00:00.000Z",
        "eventTimezone": "Asia/Kolkata",
        "roundNumber": 1,
        "totalInterviews": 2,
        "durationMinutes": 60,
        "recruiterNotes": "Technical round",
        "result": "Selected",
        "meetingUrl": "https://meet.example.com/interview-123"
      }
    ]
  }
}
```

---

# Interviewer Workload & Coverage Report

Get comprehensive interviewer workload analysis with detailed interview breakdowns and statistics.

## Endpoint

```
GET /interview/report/interviewer-workload
```

## Query Parameters

| Parameter       | Type    | Required    | Description                                                            |
| --------------- | ------- | ----------- | ---------------------------------------------------------------------- |
| `filter`        | string  | Yes         | One of: `today`, `past7days`, `past30days`, `custom`                   |
| `startDate`     | string  | Conditional | Required if `filter=custom`. Format: YYYY-MM-DD                        |
| `endDate`       | string  | Conditional | Required if `filter=custom`. Format: YYYY-MM-DD (must be >= startDate) |
| `timezone`      | stirng  | yes         | User's timezone specified in IANA Format                               |
| `interviewerId` | integer | No          | Filter by specific interviewer ID                                      |

## Example Requests

### Get last 7 days workload

```http
GET /interviews/report/interviewer-workload?filter=past7days&timezone=Asia/Kolkata
```

### Get custom date range

```http
GET /interviews/report/interviewer-workload?filter=custom&startDate=2026-12-01&endDate=2026-12-31&timezone=Asia/Kolkata
```

### Get specific interviewer workload

```http
GET /interviews/report/interviewer-workload?filter=past30days&interviewerId=3&timezone=Asia/Kolkata
```

## Response

### Success Response (200 OK)

```json
{
  "success": true,
  "message": "Interviewer workload report retrieved successfully",
  "data": {
    "interviewers": [
      {
        "interviewerId": 1,
        "interviewerName": "Thangavel",
        "statistics": {
          "totalInterviews": 6,
          "interviewsConducted": 6,
          "pending": 2,
          "selected": 2,
          "rejected": 2,
          "cancelled": 0,
          "cancelledByCandidates": 0
        },
        "interviews": [
          {
            "candidateId": 101,
            "candidateName": "Ajaypal Padhiyar",
            "role": "ROR Devel",
            "round": "R1",
            "date": "24-Dec",
            "result": "Pending",
            "feedback": null,
            "recruiterId": 5,
            "recruiterName": "Khushi Shah"
          },
          {
            "candidateId": 102,
            "candidateName": "Varun Bajaj",
            "role": "TPM",
            "round": "R1",
            "date": "23-Dec",
            "result": "Rejected",
            "feedback": "Needs more experience in agile methodologies",
            "recruiterId": 6,
            "recruiterName": "Jayraj"
          }
        ]
      },
      {
        "interviewerId": 2,
        "interviewerName": "Bhavin Trivedi",
        "statistics": {
          "totalInterviews": 4,
          "interviewsConducted": 4,
          "pending": 1,
          "selected": 1,
          "rejected": 2,
          "cancelled": 0,
          "cancelledByCandidates": 0
        },
        "interviews": [
          {
            "candidateId": 107,
            "candidateName": "Rahul Mehta",
            "role": "QA Lead",
            "round": "R1",
            "date": "24-Dec",
            "result": "Rejected",
            "feedback": "Limited automation experience",
            "recruiterId": 5,
            "recruiterName": "Khushi Shah"
          }
        ]
      }
    ]
  }
}
```

## Response Fields

### Interviewer Details

Each interviewer object contains:

#### Statistics

- `totalInterviews`: Total interviews for this interviewer
- `interviewsConducted`: Number of completed interviews
- `pending`: Number of pending interviews
- `selected`: Number of candidates selected
- `rejected`: Number of candidates rejected
- `cancelled`: Number of cancelled interviews
- `cancelledByCandidates`: Number of cancellations by candidates

#### Interviews Array

Detailed breakdown of each interview:

- `candidateId`: Unique candidate identifier
- `candidateName`: Name of the candidate
- `role`: Job role for the interview
- `round`: Interview round (R1, R2, etc.)
- `date`: Interview date (formatted as DD-MMM)
- `result`: Interview outcome (Pending, Selected, Rejected, Cancelled)
- `feedback`: Interviewer's feedback (if provided)
- `recruiterId`: ID of the recruiter who scheduled the interview
- `recruiterName`: Name of the recruiter

## Filter Options

| Filter       | Description                  | Date Range                         |
| ------------ | ---------------------------- | ---------------------------------- |
| `today`      | Today's interviews only      | Current date                       |
| `past7days`  | Last 7 days including today  | Today - 6 days to today            |
| `past30days` | Last 30 days including today | Today - 29 days to today           |
| `custom`     | Custom date range            | User-specified start and end dates |

## Error Responses

### Validation Error (400)

```json
{
  "success": false,
  "message": "Validation failed",
  "errorCode": "VALIDATION_ERROR",
  "details": {
    "validationErrors": [
      {
        "field": "filter",
        "message": "Filter must be one of: today, past7days, past30days, custom"
      }
    ]
  }
}
```

### Missing Required Fields for Custom Filter (400)

```json
{
  "success": false,
  "message": "Validation failed",
  "errorCode": "VALIDATION_ERROR",
  "details": {
    "validationErrors": [
      {
        "field": "startDate",
        "message": "startDate is required when filter is custom"
      },
      {
        "field": "endDate",
        "message": "endDate is required when filter is custom"
      }
    ]
  }
}
```

### Invalid Date Range (400)

```json
{
  "success": false,
  "message": "Validation failed",
  "errorCode": "VALIDATION_ERROR",
  "details": {
    "validationErrors": [
      {
        "field": "endDate",
        "message": "endDate must be greater than or equal to startDate"
      }
    ]
  }
}
```

### Invalid Timezone Error

- Only active interviewers with at least one interview in the date range are included
- Round numbers are dynamically calculated based on interview chronological order per candidate
- All timestamps are in UTC but formatted for easy reading
- Results are automatically capitalized for consistency
- The report excludes soft-deleted interviews and inactive records
- Average interviews per interviewer is rounded to 1 decimal place

## Error Responses

### Validation Error

```json
{
  "success": false,
  "message": "Validation failed",
  "errorCode": "VALIDATION_ERROR",
  "details": {
    "validationErrors": [
      {
        "field": "interviewDate",
        "message": "Interview date must be in YYYY-MM-DD format"
      },
      {
        "field": "durationMinutes",
        "message": "Duration must be at least 15 minutes"
      }
    ]
  }
}
```

### Time Conflict Error

```json
{
  "success": false,
  "message": "Candidate already has an overlapping interview",
  "errorCode": "CANDIDATE_TIME_CONFLICT",
  "details": {
    "candidateId": "conflict"
  }
}
```

### Not Found Error

```json
{
  "success": false,
  "message": "Interview Entry with 999 not found",
  "errorCode": "INTERVIEW_ENTRY_NOT_FOUND"
}
```

### Invalid Timezone Error

```json
{
  "success": false,
  "message": "Invalid date/time for the specified timezone",
  "errorCode": "INVALID_TIMEZONE_TIME"
}
```

---

## Notes

- All timestamps are stored and returned in UTC
- The system automatically detects scheduling conflicts for both candidates and interviewers
- Round numbers are automatically managed and renumbered when interviews are deleted
- Soft deletion is used - deleted interviews are marked inactive but retained for 15 days
- All operations are logged in the audit trail

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

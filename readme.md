# Authentication Endpoints

### Endpoints

## POST /auth/register

Registers a new user.

## Request Body (JSON)

json
{
"memberName": "John Doe",
"memberContact": "+91 9999999999",
"email": "john@example.com",
"password": "Password@123",
"designation": "software engineer",
"isRecruiter": false,
"isInterviewer":false
}
designation must match existing designation values in the database lookup table (case-insensitive).

## Response

json
{
"success": true,
"message": "Registration successful",
"data": {
"member": {
"memberId": 1,
"memberName": "John Doe",
"email": "john@example.com",
"designation": 4,
"isRecruiter": false,
"isInterviewer":false
}
}
}

## POST /auth/login

Logs in the user and returns a JWT token.

## Request Body (JSON)

json
{
"email": "john@example.com",
"password": "Password@123"
}

## Response

json
{
"success": true,
"message": "Login successful",
"data": {
"member": {
"memberId": 1,
"memberName": "John Doe",
"email": "john@example.com",
"designation": 4,
"isRecruiter": false
},
"token": "<JWT_ACCESS_TOKEN>",
"expiresIn": "2h"
}
}
The JWT access token includes jti (unique token ID) and family claims.

Use this token in the Authorization header for all subsequent authenticated requests:

text
Authorization: Bearer <JWT_ACCESS_TOKEN>

## POST /auth/refresh

(Optional) Refreshes the current JWT token before expiry.

## Request

Accepts the current token either in request body or Authorization header.

## optional Request body:

{
"token":"jwt_token"
}

## Response

json
{
"success": true,
"message": "Token refreshed successfully",
"data": {
"token": "<NEW_JWT_ACCESS_TOKEN>",
"expiresIn": "2h"
}
}
Revokes the old token identified by jti and issues a new token in the same token family.

## POST /auth/logout

Revokes the current token.

## Request

Token sent in Authorization header or optionally in request body.

## Response

json
{
"success": true,
"message": "Logout successful"
}
The token's jti is marked revoked to invalidate it.

## POST /auth/logout-all

Revokes all tokens for the authenticated user across devices.

Headers

text
Authorization: Bearer <JWT_ACCESS_TOKEN>

## Response

json
{
"success": true,
"message": "Logged out from all devices successfully"
}

## GET /auth/sessions

Fetches all active non-revoked sessions (tokens) for the authenticated user with details.

## Headers

text
Authorization: Bearer <JWT_ACCESS_TOKEN>

## Response

json
{
"success": true,
"data": {
"sessions": [
{
"id": 10,
"userAgent": "Mozilla/5.0 Chrome/120.0.0",
"ipAddress": "192.168.1.2",
"createdAt": "2025-10-20T10:35:24.000Z",
"expiresAt": "2025-10-27T10:35:24.000Z",
"tokenFamily": "c693a76a-90a8-4441-b229-bb57cc4f3f70"
}
]
}
}

## GET /auth/profile

Returns the profile of the authenticated user.

Headers

text
Authorization: Bearer <JWT_ACCESS_TOKEN>

## Response

json
{
"success": true,
"data": {
"member": {
"memberId": 1,
"email": "john@example.com",
"designation": 4,
"isRecruiter": false
}
}
}

## NOTES

---

Authorization Requirement for Endpoints
All API endpoints below require the client to include a valid Access Token in the HTTP Authorization header for authentication and authorization, except for the explicitly public endpoints (/register, /login, /refresh, /logout).

The Access Token must be supplied as a Bearer token:

Authorization: Bearer <ACCESS_TOKEN>
Failure to provide a valid token in the Authorization header will result in a 401 Unauthorized response.

---

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

# Job Profile API CRUD

---

## API Endpoints

### Base URL

/jobProfile

### Endpoints

#### 1. Create Job Profile

**POST** `/jobProfile`

**Request Body:**
{
"clientId":2,
"departmentId":86,
"jobProfileDescription":"Random JOB description for testing job profile",
"jobRole": "SDE",
"workArrangement":"onsite"
"location": {
"city": "Ahmedabad",
"country": "India"
},
"positions": 4,
"techSpecification": "NodeJS,ExpressJS"
}

**Response:**
{
"success": true,
"message": "Job Profile created successfully",
"data": {
"jobProfileId": 25,
"clientId": 2,
"departmentId": 86,
"jobProfileDescription": "Random JOB description for testing job profile",
"jobRole": "SDE",
"positions": 4,
"techSpecification": "NodeJS,ExpressJS",
"locationId": 1,
"workArrangement":"onsite"
"statusId": 4,
"receivedOn": "2025-11-26T11:10:40.223Z"
}
}

---

#### 2. Get All Job Profiles

**GET** `/jobProfile`

**Response:**
{
"success": true,
"message": "Job Profiles retrieved successfully",
"data": [
{
"jobProfileId": 25,
"clientName": "Intuit Bangalore Headquarters",
"departmentName": "DevOps and AIOps",
"jobProfileDescription": "Random JOB description for testing job profile",
"jobRole": "SDE-3",
"techSpecification": "NodeJS,ExpressJS",
"positions": 4,
"receivedOn": "2025-11-26T05:40:40.000Z",
"estimatedCloseDate": null,
"workArrangement": "hybrid",
"location": {
"city": "Ahmedabad",
"country": "India"
},
"status": "In Progress"
},
{
"jobProfileId": 23,
"clientName": "IBM Company",
"departmentName": "Software",
"jobProfileDescription": "Continuous integration/deployment, and monitoring of Intuit's cloud infrastructure. Teams responsible for operational monitoring of Intuit's cloud infrastructure.",
"jobRole": "Frontend",
"techSpecification": "React",
"positions": 2,
"receivedOn": "2025-11-07T01:56:44.000Z",
"estimatedCloseDate": "2025-11-24T13:00:00.000Z",
"workArrangement": "onsite",
"location": {
"city": "Ahmedabad",
"country": "India"
},
"status": "Closed"
}
]
}

---

#### 3. Get Job Profile by ID

**GET** `/jobProfile/:id`

**Response:**
{
"success": true,
"message": "Job Profile retrieved successfully",
"data": {
"jobProfileId": 25,
"clientId": 2,
"clientName": "Intuit Bangalore Headquarters",
"departmentName": "DevOps and AIOps",
"jobProfileDescription": "Random JOB description for testing job profile",
"jobRole": "SDE-3",
"techSpecification": "NodeJS,ExpressJS",
"positions": 4,
"receivedOn": "2025-11-26T05:40:40.000Z",
"estimatedCloseDate": null,
"workArrangement": "hybrid",
"location": {
"city": "Ahmedabad",
"country": "India"
},
"status": "In Progress"
}
}

---

#### 4. Update Job Profile

**PATCH** `/jobProfile/:id`

**Request Body:**
{
"jobRole":"SDE-2"
}

**Response:**
{
"success": true,
"message": "Job profile updated successfully",
"data": {
"jobProfileId": 25,
"clientId": 2,
"clientName": "Intuit Bangalore Headquarters",
"departmentName": "DevOps and AIOps",
"jobProfileDescription": "Random JOB description for testing job profile",
"jobRole": "SDE-1",
"techSpecification": "NodeJS,ExpressJS",
"positions": 4,
"receivedOn": "2025-11-26T05:40:40.000Z",
"estimatedCloseDate": null,
"workArrangement": "hybrid",
"location": {
"city": "Ahmedabad",
"country": "India"
},
"status": "In Progress"
}
}

---

#### 5. Delete Job Profile

**DELETE** `/jobProfile/:id`

**Response:**
{
"success": true,
"message": "Job Profile deleted successfully",
"data": null
}

---

## Validation Rules

Handled via Joi:

- `clientId`, `departmentId`, `positions`: positive integers
- `jobProfileDescription`: minimum 10, maximum 500 characters
- `jobRole`: 2–100 characters
- `techSpecification`: comma-separated list, min 2 chars each
- `estimatedCloseDate`: must be a valid date in the future
- `location` : must be a json object with city and country attributes

**Example Error:**
{
"success": false,
"error": "VALIDATION_ERROR",
"message": "Validation failed",
"details": [
{ "field": "jobRole", "message": "Job role is required" }
]
}

---

## Error Handling

Uses `AppError` with centralized response formatting.

**Example Database Error:**
{
"success": false,
"error": "FOREIGN_KEY_CONSTRAINT",
"message": "Invalid foreign key provided - referenced record does not exist"
}

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
"statusName": "interview pending",
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
"statusName": "interview pending",
"resumeFilename": null,
"resumeOriginalName": null,
"resumeUploadDate": null
}
]
}

---

### Get Candidate by ID

GET /candidate/:id

**Response:**
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
"preferredJobLocation":{
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

---

### GET candidate form data

GET /candidate/create-data

**Response:**
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
"status": [
{
"lookupKey": 8,
"value": "Selected"
},
{
"lookupKey": 9,
"value": "Interview pending"
},
{
"lookupKey": 10,
"value": "Rejected"
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

---

### Create Candidate (with optional resume upload)

POST /candidate
Content-Type: multipart/form-data
**Request Body (form-data):**

| Field                | Type        | Description                                            |
| -------------------- | ----------- | ------------------------------------------------------ |
| candidateName        | String      | Candidate full name (required)                         |
| contactNumber        | String      | Phone number (required)                                |
| email                | String      | Email address (required)                               |
| recruiterName        | String      | Recruiter name (required) [must be in member table]    |
| jobRole              | String      | Job title (required)                                   |
| preferredJobLocation | JSON Object | must be a json object with city and country attributes |
| currentCTC           | Number      | Current CTC in INR (required)                          |
| expectedCTC          | Number      | Expected CTC in INR (required)                         |
| noticePeriod         | Number      | Notice period in days (required)                       |
| experienceYears      | Number      | Years of experience (required)                         |
| linkedinProfileUrl   | String      | LinkedIn URL (optional)                                |
| resume               | File        | PDF resume, max 5MB (optional)                         |
| status               | String      | candidate status 50 characters (optional)              |
| notes                | string      | notes about candidates (optional)                      |

**Response:**
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

---

### Update Candidate

PATCH /candidate/:id
Content-Type: multipart/form-data

**Request Body (JSON) - fields to update:**
{
"jobRole": "Senior Backend Developer",
"expectedCTC": 1500000,
"status": "interview pending"
}

**Response:**
{
"message": "Candidate updated successfully",
"data": {
"candidateId": 124,
"candidateName": "Jane Smith",
"jobRole": "Senior Backend Developer",
"expectedCTC": 1500000,
"statusName": "interview pending"
}
}

---

### Delete Candidate

DELETE /candidate/:id

**Response:**
{
"success": true,
"message": "Candidate deleted successfully",
"data": null
}

---

### Upload or Replace Resume

POST /candidate/:id/resume
Content-Type: multipart/form-data

**Form data:**

| Field  | Type | Description        |
| ------ | ---- | ------------------ |
| resume | File | PDF resume max 5MB |

**Response:**
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
{
"message": "Resume deleted successfully"
}

---

## Error Response Example

{
"error": "Candidate with ID 999 not found",
"code": 404
}

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

# Member Endpoints

Validation & Transformation
Joi Schemas

MemberValidator uses Joi to validate:​

memberSchema.update – body for PATCH /members/:memberId

memberSchema.params – memberId route param

Key rules:

memberName: string, 2–100 chars.

memberContact: pattern for phone-like values, max 25 chars.

email: valid email.

designation: string, lowercased, 2–100 chars.

isRecruiter, isInterviewer: booleans.

client, organisation: non-empty strings, max 255 chars.

skills: array of { skillName, proficiencyLevel('beginner','intermediate','advanced'.'expert'), yearsOfExperience }.

location: { cityName, country },

interviewerCapacity : Integer (Optional)

If validation fails, an AppError with code VALIDATION_ERROR is thrown, containing validationErrors.​

Transform Helpers

MemberValidatorHelper converts human-readable fields to DB IDs:​

transformDesignation(designation)

Queries lookup table (tag = 'designation') to get lookupKey.

Uses an in-memory cache to avoid repeated queries.

transformClient(clientName)

Queries client table to get clientId, with caching.

transformSkills(skills)

For each { skillName, proficiencyLevel, yearsOfExperience }, loads lookupKey from lookup (tag = 'skill').

Returns { skill, proficiencyLevel, yearsOfExperience } with skill as the ID.

getLocationIdByName(location)

Uses location.city (note: your schema uses cityName – adjust as needed) to find locationId in location table.

All these throw AppError with meaningful codes like INVALID_SKILL, INVALID_DESIGNATION, INVALID_CLIENT_NAME, INVALID_LOCATION.​

API Endpoints
Base path (example): /api/member

1. Get All Members

GET /member

Returns all active members with joined metadata (designation, location, client, skills).​

Example request:

GET /member HTTP/1.1
Host: localhost:3000
Authorization: Bearer <token>
Success response (200):

{
"success": true,
"message": "Members retrieved successfully",
"data": [
{
"memberId": 1,
"memberName": "Palash Acharya",
"memberContact": "+91-9876543210",
"email": "palash.acharya@aerolens.in",
"designation": "Admin",
"isRecruiter": 1,
"isActive": 1,
"lastLogin": "2025-11-30T01:48:05.000Z",
"createdAt": "2025-10-21T03:58:42.000Z",
"updatedAt": "2025-11-30T01:48:05.000Z",
"cityName": "Ahmedabad",
"country": "India",
"clientName": null,
"organisation": null,
"isInterviewer": 1,
"interviewerCapacity": null,
"skills": [
{
"skillId": 43,
"skillName": "DBMS",
"proficiencyLevel": "Intermediate",
"yearsOfExperience": 1
},
{
"skillId": 42,
"skillName": "ExpressJS",
"proficiencyLevel": "Intermediate",
"yearsOfExperience": 1
},
{
"skillId": 41,
"skillName": "NodeJS",
"proficiencyLevel": "Intermediate",
"yearsOfExperience": 1
}
]
},
{
"memberId": 420,
"memberName": "Jaival Suthar",
"memberContact": "+91 9999999999",
"email": "jaival@testing.com",
"designation": "Admin",
"isRecruiter": 1,
"isActive": 1,
"lastLogin": "2025-12-01T04:33:24.000Z",
"createdAt": "2025-10-27T04:58:41.000Z",
"updatedAt": "2025-12-01T04:33:24.000Z",
"cityName": "Ahmedabad",
"country": "India",
"clientName": null,
"organisation": null,
"isInterviewer": 1,
"interviewerCapacity": null,
"skills": [
{
"skillId": 41,
"skillName": "NodeJS",
"proficiencyLevel": "Intermediate",
"yearsOfExperience": 1
}
]
}
]
}
Possible errors:

401 – Unauthorized (auth middleware).​

500 – MEMBER_FETCH_ERROR.​

2. Get Member By ID

GET /member/:memberId

Example request:

GET /members/1 HTTP/1.1
Host: localhost:3000
Authorization: Bearer <token>
Success response (200):

{
"success": true,
"message": "Member entry retrieved successfully",
"data": {
"memberId": 1,
"memberName": "Palash Acharya",
"memberContact": "+91-9876543210",
"email": "palash.acharya@aerolens.in",
"designation": "Admin",
"isRecruiter": 1,
"isActive": 1,
"lastLogin": "2025-11-30T01:48:05.000Z",
"createdAt": "2025-10-21T03:58:42.000Z",
"updatedAt": "2025-12-01T05:06:24.000Z",
"cityName": "Ahmedabad",
"country": "India",
"clientName": null,
"organisation": null,
"isInterviewer": 1,
"interviewerCapacity": 2,
"skills": [
{
"skillId": 41,
"skillName": "NodeJS",
"proficiencyLevel": "Intermediate",
"yearsOfExperience": 1
},
{
"skillId": 42,
"skillName": "ExpressJS",
"proficiencyLevel": "Intermediate",
"yearsOfExperience": 1
},
{
"skillId": 43,
"skillName": "DBMS",
"proficiencyLevel": "Intermediate",
"yearsOfExperience": 1
}
]
}
}
Validation / error cases:

400 – VALIDATION_ERROR if memberId is not a positive integer.​

404 – MEMBER_ID_NOT_FOUND if the member does not exist or inactive.​

3. Update Member

PATCH /member/:memberId

Validates params and body via Joi.​

Transforms designation, client, location, and skills into IDs before updating.​

Adds new interviewer skills using interviewer_skill table.​

Wraps in a DB transaction and writes an audit log.​

Example request:

PATCH /member/1 HTTP/1.1
Host: localhost:3000
Authorization: Bearer <token>
Content-Type: application/json

{
"memberName": "Johnathan Doe",
"memberContact": "+1 234 567 999",
"email": "johnathan.doe@example.com",
"designation": "Senior Developer",
"client": "Acme Corp",
"organisation": "Aerolens",
"isRecruiter": true,
"isInterviewer": true,
"location": {
"cityName": "Mumbai",
"country": "India"
},
"skills": [
{
"skillName": "Node.js",
"proficiencyLevel": "expert",
"yearsOfExperience": 5
},
{
"skillName": "React",
"proficiencyLevel": "advanced",
"yearsOfExperience": 3
}
],
"interviewerCapacity":3
}
Internally, after validation and helper transformations, the body passed to MemberService.updateMember looks roughly like:​

{
"memberName": "Johnathan Doe",
"memberContact": "+1 234 567 999",
"email": "johnathan.doe@example.com",
"organisation": "Aerolens",
"isRecruiter": true,
"isInterviewer": true,
"designationId": 12,
"clientId": 3,
"locationId": 5,
"skills": [
{
"skill": 20,
"proficiencyLevel": "expert",
"yearsOfExperience": 5
},
{
"skill": 21,
"proficiencyLevel": "advanced",
"yearsOfExperience": 3
}
],
"interviewerCapacity":3
}
Success response (200):

{
"status": "success",
"message": "Member entry updated successfully",
"data": {
"memberId": 1,
"memberName": "Johnathan Doe",
"memberContact": "+1 234 567 999",
"email": "johnathan.doe@example.com",
"organisation": "Aerolens",
"isRecruiter": true,
"isInterviewer": true,
"designationId": 12,
"clientId": 3,
"locationId": 5,
"interviewerCapacity":3
}
}
Note: Repository updateMember only updates whitelisted fields (memberName, memberContact, email, designation, isRecruiter, locationId, clientId, organisation, isInterviewer).​

Possible errors:

400 – VALIDATION_ERROR (Joi) or NO_VALID_FIELDS, MISSING_UPDATE_DATA.​

404 – MEMBER_NOT_FOUND.​

400/404 – INVALID_SKILL, INVALID_DESIGNATION, INVALID_CLIENT_NAME, INVALID_LOCATION.​

500 – MEMBER_UPDATE_ERROR for unexpected errors.​

4. Delete Member (Deactivate)

DELETE /member/:memberId

Validates memberId.​

Checks member existence.

Deactivates member (isActive = FALSE) through repository and logs an audit entry.​

Example request:

DELETE /member/1 HTTP/1.1
Host: localhost:3000
Authorization: Bearer <token>
Success response (200):

{
"status": "success",
"message": "Member entry deactivated successfully and will be deleted from database in 10 days",
"data": null
}
Possible errors:

400 – VALIDATION_ERROR for invalid memberId.​

404 – MEMBER_NOT_FOUND.​

500 – MEMBER_DELETE_ERROR for unexpected failures.​

Error Format
Errors are thrown using AppError and converted to a consistent JSON response, for example:​

{
"status": "error",
"message": "Validation failed",
"code": "VALIDATION_ERROR",
"errors": [
{
"field": "email",
"message": "Please provide a valid email address"
}
]
}
Database or service errors use informative code values like DB_ERROR, MEMBER_UPDATE_ERROR, etc.​

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
- **Response:**

```
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

Get data needed to render the interview creation form (interviewers, recruiters, etc.).

- **Method:** `GET`
- **Path:** `/create-data`
- **Response:**

```
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

Fetch all interviews for a specific candidate.

- **Method:** `GET`
- **Path:** `/candidate/:candidateId`
- **Params:**

| Field         | Type   | Required | Description         |
| ------------- | ------ | -------- | ------------------- |
| `candidateId` | number | Yes      | ID of the candidate |

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

### 7. Update Interview

Update an existing interview (partial update allowed).

- **Method:** `PATCH`
- **Path:** `/:interviewId`
- **Params:**

| Field         | Type   | Required | Description         |
| ------------- | ------ | -------- | ------------------- |
| `interviewId` | number | Yes      | ID of the interview |

- **Request Body (at least one field required):**

```
{
  "interviewDate": "2025-12-15",
  "fromTime": "10:30",
  "durationMinutes": 60,
  "interviewerId": 202,
  "scheduledById": 302
}
```

- **Validation Rules:**

| Field             | Type   | Rules                                              |
| ----------------- | ------ | -------------------------------------------------- |
| `interviewDate`   | string | YYYY-MM-DD format, cannot be in the past, optional |
| `fromTime`        | string | HH:MM format (00:00–23:59), optional               |
| `durationMinutes` | number | Integer, 15–480 minutes, optional                  |
| `interviewerId`   | number | Positive integer, optional                         |
| `scheduledById`   | number | Positive integer, optional                         |

- **Response:**

```
{
  "success": true,
  "message": "Interview entry updated successfully",
  "data": {
    "interviewId": 1,
    "candidateId": 101,
    "roundNumber": 1,
    "totalInterviews": 2,
    "interviewDate": "2025-12-15",
    "fromTime": "10:30",
    "durationMinutes": 60,
    "interviewerId": 202,
    "scheduledById": 302,
    "result": "pending",
    "recruiterNotes": "Initial screening",
    "interviewerFeedback": null
  }
}
```

---

### 8. Finalize Interview

Set the final result and feedback for an interview.

- **Method:** `PUT`
- **Path:** `/:interviewId/finalize`
- **Params:**

| Field         | Type   | Required | Description         |
| ------------- | ------ | -------- | ------------------- |
| `interviewId` | number | Yes      | ID of the interview |

- **Request Body:**

```
{
  "result": "selected",
  "recruiterNotes": "Strong candidate, good fit",
  "interviewerFeedback": "Technical skills are excellent"
}
```

- **Validation Rules:**

| Field                 | Type   | Rules                                                            |
| --------------------- | ------ | ---------------------------------------------------------------- |
| `result`              | string | One of: `pending`, `selected`, `rejected`, `cancelled`, required |
| `recruiterNotes`      | string | Max 1000 characters, optional, can be `""` or `null`             |
| `interviewerFeedback` | string | Max 2000 characters, optional, can be `""` or `null`             |

- **Response:**

```
{
  "success": true,
  "message": "Interview finalized successfully",
  "data": {
    "interviewId": 1,
    "result": "selected",
    "recruiterNotes": "Strong candidate, good fit",
    "interviewerFeedback": "Technical skills are excellent"
  }
}
```

---

### 9. Delete Interview

Soft-delete an interview (set `isActive = false`).

- **Method:** `DELETE`
- **Path:** `/:interviewId`
- **Params:**

| Field         | Type   | Required | Description         |
| ------------- | ------ | -------- | ------------------- |
| `interviewId` | number | Yes      | ID of the interview |

- **Response:**

```
{
  "success": true,
  "message": "Interview entry deleted successfully",
  "data": {
    "interviewId": 1,
    "deletedAt": "2025-12-12T13:10:26.102Z"
  }
}
```

---

### 10. Overall Summary Report

Get total interview stats grouped by interviewer.

- **Method:** `GET`
- **Path:** `/report/overall`
- **Response:**

```
{
  "success": true,
  "message": "Total Interviewer Data Retrieved Successfully",
  "data": {
    "interviewers": [
      {
        "interviewerId": 201,
        "interviewerName": "Alice Smith",
        "total": 5,
        "selected": 2,
        "rejected": 1,
        "pending": 1,
        "cancelled": 1,
        "avgDuration": 45,
        "totalMinutes": 225
      }
    ]
  }
}
```

---

### 11. Monthly Summary Report

Get interview summary for a date range.

- **Method:** `GET`
- **Path:** `/report/monthly`
- **Query Params:**

| Field       | Type   | Required | Description                                          |
| ----------- | ------ | -------- | ---------------------------------------------------- |
| `startDate` | string | Yes      | Start date in YYYY-MM-DD format                      |
| `endDate`   | string | Yes      | End date in YYYY-MM-DD format, must be > `startDate` |

- **Response:**

```
{
  "success": true,
  "message": "Total Monthly Summary Data Retrieved Successfully",
  "data": {
    "summary": {
      "total": 10,
      "selected": 4,
      "rejected": 3,
      "pending": 2,
      "cancelled": 1
    },
    "interviewers": [
      {
        "interviewerId": 201,
        "interviewerName": "Alice Smith",
        "total": 5,
        "selected": 2,
        "rejected": 1,
        "pending": 1,
        "cancelled": 1,
        "avgDuration": 45,
        "totalMinutes": 225
      }
    ],
    "interviewDates": [
      { "interviewDate": "2025-12-15" },
      { "interviewDate": "2025-12-16" }
    ]
  }
}
```

---

### 12. Daily Summary Report

Get all interviews scheduled for a specific date.

- **Method:** `GET`
- **Path:** `/report/daily`
- **Query Params:**

| Field  | Type   | Required | Description               |
| ------ | ------ | -------- | ------------------------- |
| `date` | string | Yes      | Date in YYYY-MM-DD format |

- **Response:**

```
{
  "success": true,
  "message": "Total Daily Summary Data Retrieved Sucessfully",
  "data": {
    "interviews": [
      {
        "interviewerId": 201,
        "interviewerName": "Alice Smith",
        "interviewId": 1,
        "candidateId": 101,
        "candidateName": "John Doe",
        "interviewDate": "2025-12-15",
        "fromTime": "10:00",
        "toTime": "10:45",
        "roundNumber": 1,
        "totalInterviews": 2,
        "durationMinutes": 45,
        "recruiterNotes": "Initial screening",
        "result": "pending"
      }
    ]
  }
}
```

---

## Error Response Format

All validation and business errors return a consistent format:

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

Common error codes:

- `VALIDATION_ERROR` – Request body/query/params failed validation
- `INTERVIEW_ENTRY_NOT_FOUND` – Interview with given ID not found
- `NO_PREVIOUS_INTERVIEWS` – No previous interviews for candidate (for next round)
- `INTERVIEW_NOT_FOUND` – Interview not found during delete
- Database errors (e.g., `DATABASE_ERROR`, `DATABASE_SCHEMA_ERROR`, etc.)

---

## Notes

- All dates are in `YYYY-MM-DD` format.
- Time is in `HH:MM` 24‑hour format.
- `result` is always returned in capitalized form (e.g., `Pending`, `Selected`).
- Soft-deleted interviews (`isActive = false`) are excluded from all reports and list endpoints.
- Round numbers are automatically renumbered when an interview is deleted.

```

```

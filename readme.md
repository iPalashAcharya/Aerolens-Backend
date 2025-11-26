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
"isRecruiter": false
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
"isRecruiter": false
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
"jobRole": "SDE",
"techSpecification": "NodeJS,ExpressJS",
"positions": 4,
"receivedOn": "2025-11-26T11:10:40.000Z",
"estimatedCloseDate": null,
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
"receivedOn": "2025-11-07T07:26:44.000Z",
"estimatedCloseDate": "2025-11-24T18:30:00.000Z",
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
"clientName": "Intuit Bangalore Headquarters",
"departmentName": "DevOps and AIOps",
"jobProfileDescription": "Random JOB description for testing job profile",
"jobRole": "SDE",
"techSpecification": "NodeJS,ExpressJS",
"positions": 4,
"receivedOn": "2025-11-26T11:10:40.000Z",
"estimatedCloseDate": null,
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
"jobRole": "SDE-3",
"techSpecification": "NodeJS,ExpressJS",
"positions": 4,
"receivedOn": "2025-11-26T05:40:40.000Z",
"estimatedCloseDate": null,
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
"recruiterName": "Jayraj",
"jobRole": "SDE",
"preferredJobLocation": "Ahmedabad",
"currentCTC": 23,
"expectedCTC": 33,
"noticePeriod": 30,
"experienceYears": 1,
"linkedinProfileUrl": "https://www.linkedin.com/in/aksh-patel1/",
"createdAt": "2025-09-27T11:39:13.000Z",
"updatedAt": "2025-11-21T11:00:40.000Z",
"statusName": "interview pending",
"resumeFilename": "resumes/candidate_38_1763722838929.docx",
"resumeOriginalName": "AICTE_Internship_2024_Project_Report_Template_2.docx",
"resumeUploadDate": "2025-11-21T11:00:40.000Z"
},
{
"candidateId": 40,
"candidateName": "Parth",
"contactNumber": "9898200321",
"email": "parth@gmail.com",
"recruiterName": "Jayraj",
"jobRole": "Software Devloper",
"preferredJobLocation": "Ahmedabad",
"currentCTC": 300,
"expectedCTC": 600,
"noticePeriod": 60,
"experienceYears": 3,
"linkedinProfileUrl": "https://www.linkedin.com/in/meghana-kaki-0862b8167/",
"createdAt": "2025-09-27T11:44:07.000Z",
"updatedAt": "2025-09-27T11:44:07.000Z",
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
"candidateId": 38,
"candidateName": "Yash Prajapati",
"contactNumber": "9870654321",
"email": "jaivals21@testing.com",
"recruiterName": "Jayraj",
"jobRole": "SDE",
"preferredJobLocation": "Ahmedabad",
"currentCTC": 23,
"expectedCTC": 33,
"noticePeriod": 30,
"experienceYears": 1,
"linkedinProfileUrl": "https://www.linkedin.com/in/aksh-patel1/",
"statusName": "interview pending",
"resumeFilename": "resumes/candidate_38_1763722838929.docx",
"resumeOriginalName": "AICTE_Internship_2024_Project_Report_Template_2.docx",
"resumeUploadDate": "2025-11-21T11:00:40.000Z"
}
}

---

### Create Candidate (with optional resume upload)

POST /candidate
Content-Type: multipart/form-data
**Request Body (form-data):**

| Field                | Type   | Description                                      |
| -------------------- | ------ | ------------------------------------------------ |
| candidateName        | String | Candidate full name (required)                   |
| contactNumber        | String | Phone number (required)                          |
| email                | String | Email address (required)                         |
| recruiterName        | String | Recruiter name (required)                        |
| jobRole              | String | Job title (required)                             |
| preferredJobLocation | String | Ahmedabad / Bangalore / San Francisco (required) |
| currentCTC           | Number | Current CTC in INR (required)                    |
| expectedCTC          | Number | Expected CTC in INR (required)                   |
| noticePeriod         | Number | Notice period in days (required)                 |
| experienceYears      | Number | Years of experience (required)                   |
| linkedinProfileUrl   | String | LinkedIn URL (optional)                          |
| resume               | File   | PDF resume, max 5MB (optional)                   |
| status               | String | candidate status 50 characters (optional)        |

**Response:**
{
"success": true,
"message": "Candidate created successfully",
"data": {
"candidateId": 26,
"candidateName": "Palash Testing",
"contactNumber": "9999996",
"currentCTC": 9,
"email": "palashtest321@example.com",
"expectedCTC": 11,
"experienceYears": 4,
"jobRole": "Backend Engineer",
"linkedinProfileUrl": "https://www.linkedin.com/in/alice-johnson",
"noticePeriod": 30,
"preferredJobLocation": 1,
"recruiterName": "Jayraj",
"statusId": 9,
"createdOn": "2025-09-26T12:11:27.615Z"
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

Error Codes
VALIDATION_ERROR – Invalid input data

LOOKUP_NOT_FOUND – Lookup entry doesn’t exist

DUPLICATE_LOOKUP_VALUE – Entry with the same value already exists

DATABASE_ERROR – Generic database error

DATABASE_SCHEMA_ERROR – Missing table or invalid schema

DATABASE_CONNECTION_ERROR – Connection timeout or reset

# Client API Endpoints

This document describes the RESTful API endpoints for Aerolens Backend

---

## Endpoints

### GET `/client`

Retrieve a paginated list of clients.

#### Query Parameters

- `page` (optional, integer, default: 1) - Page number for pagination, minimum 1.
- `limit` (optional, integer, default: 10, max: 100) - Number of records per page.

#### Response

- `data`: Array of client objects with the following fields:
  - `clientId` (integer)
  - `clientName` (string)
  - `address` (string)
  - `location` (geospatial data)
- `pagination`: Pagination metadata including:
  - `currentPage`
  - `totalPages`
  - `totalRecords`
  - `limit`
  - `hasNextPage`
  - `hasPrevPage`
  - `nextPage`
  - `prevPage`

#### Example Request

GET /?page=1&limit=10

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
  "data": {
  "clientId": 123,
  "clientName": "Client Name",
  "address": "Client address",
  "location": {
  "type": "Point",
  "coordinates": [longitude, latitude]
  },
  "departments": [
  {
  "departmentId": 1,
  "departmentName": "HR",
  "departmentDescription": "Human Resources"
  }
  ],
  "clientContacts": [
  {
  "clientContactId": 1,
  "contactPersonName": "Jane Doe",
  "designation": "Manager",
  "phone": "1234567890",
  "email": "jane@example.com"
  }
  ],
  "meta": {
  "departmentCount": 1,
  "contactCount": 1,
  "retrievedAt": "2025-09-02T12:34:56.789Z"
  }
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
| `phone`             | String | Yes      | Contact person's phone       |
| `email`             | String | Yes      | Contact person's email       |

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
"clientId": 1,
"departmentId": 2,
"jobProfileDescription": "Responsible for managing backend APIs",
"jobRole": "Backend Engineer",
"techSpecification": "Node.js, Express, SQL",
"positions": 3,
"estimatedCloseDate": "2025-12-31",
"location": "US",
"status": "In Progress"
}

**Response:**
{
"success": true,
"message": "Job Profile created successfully",
"data": {
"jobProfileId": 10,
"clientId": 1,
"departmentId": 2,
"jobProfileDescription": "Responsible for managing backend APIs",
"jobRole": "Backend Engineer",
"techSpecification": "Node.js, Express, SQL",
"positions": 3,
"estimatedCloseDate": "2025-12-31",
"receivedOn":"2025-10-31"
"location": "US",
"status": "In Progress"
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
"jobProfileId": 3,
"clientName": "Intuit Banglore",
"departmentName": "Finance/Budgeting1dfdfd",
"jobProfileDescription": "Random description",
"jobRole": "SDE",
"techSpecification": "testing,quality assurance",
"positions": 3,
"receivedOn": "2025-09-16T13:16:07.000Z",
"estimatedCloseDate": "2025-10-20T15:30:00.000Z",
"locationId": 2,
"statusName": "In Progress"
}
]
}

---

#### 3. Get Job Profile by ID

**GET** `/jobProfile/:id`

**Response:**
{
"success": true,
"message": "Department retrieved successfully",
"data": {
"jobProfileId": 3,
"clientId": 2,
"clientName": "Intuit Banglore",
"departmentName": "Finance/Budgeting1dfdfd",
"jobProfileDescription": "Random description",
"jobRole": "SDE",
"techSpecification": "testing,quality assurance",
"positions": 3,
"receivedOn": "2025-09-16T13:16:07.000Z",
"estimatedCloseDate": "2025-10-20T15:30:00.000Z",
"locationId": 2,
"statusName": "In Progress"
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
"jobProfileId": 3,
"clientId": 2,
"clientName": "Intuit Banglore",
"departmentName": "Finance/Budgeting1dfdfd",
"jobProfileDescription": "Random description",
"jobRole": "SDE-2",
"techSpecification": "testing,quality assurance",
"positions": 3,
"receivedOn": "2025-09-16T13:16:07.000Z",
"estimatedCloseDate": "2025-10-20T15:30:00.000Z",
"locationId": 2,
"statusName": "In Progress"
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

- `clientId`, `departmentId`, `locationId`, `positions`: positive integers
- `jobProfileDescription`: minimum 10, maximum 500 characters
- `jobRole`: 2–100 characters
- `techSpecification`: comma-separated list, min 2 chars each
- `estimatedCloseDate`: must be a valid date in the future

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

### Get All Candidates (Paginated & Filtered)

GET /candidate?page=1&pageSize=10&status=selected&preferredJobLocation=bangalore

**Query Parameters:**

| Parameter            | Type   | Description                                 |
| -------------------- | ------ | ------------------------------------------- |
| page                 | Number | Page number (default: 1)                    |
| pageSize             | Number | Number of candidates per page (default: 10) |
| status               | String | Filter by candidate status (optional)       |
| preferredJobLocation | String | Filter by location (optional)               |

**Response:**
{
"data": [
{
"candidateId": 123,
"candidateName": "John Doe",
"contactNumber": "+1234567890",
"email": "john@example.com",
"recruiterName": "yash",
"jobRole": "Software Engineer",
"preferredJobLocation": "Bangalore",
"currentCTC": 900000,
"expectedCTC": 1200000,
"noticePeriod": 30,
"experienceYears": 4,
"linkedinProfileUrl": "https://linkedin.com/in/johndoe",
"statusName": "selected",
"resumeFilename": "candidate123_resume.pdf",
"resumeOriginalName": "John_Doe_Resume.pdf",
"resumeUploadDate": "2025-09-20T14:30:00.000Z"
}
],
"pagination": {
"currentPage": 1,
"pageSize": 10,
"totalCount": 50,
"totalPages": 5,
"hasNextPage": true,
"hasPreviousPage": false
}
}

---

### Get Candidate by ID

GET /candidate/:id

**Response:**
{
"candidateId": 123,
"candidateName": "John Doe",
"contactNumber": "+1234567890",
"email": "john@example.com",
"statusName": "selected",
"preferredJobLocation": "Bangalore",
"jobRole": "Software Engineer",
"recruiterName": "yash",
"currentCTC": 900000,
"expectedCTC": 1200000,
"noticePeriod": 30,
"experienceYears": 4,
"linkedinProfileUrl": "https://linkedin.com/in/johndoe",
"resumeFilename": "candidate123_resume.pdf",
"resumeOriginalName": "John_Doe_Resume.pdf",
"resumeUploadDate": "2025-09-20T14:30:00.000Z"
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
"message": "Candidate deleted successfully"
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

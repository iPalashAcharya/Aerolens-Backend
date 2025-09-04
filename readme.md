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

### POST `/client`

Create a new client entry.

#### Request Body

- `name` (string, required) - Client name.
- `address` (string, required) - Client address; will be geocoded.

#### Behavior

- Converts the provided `address` into geospatial coordinates.
- Stores client details along with location as a POINT in the database.
- Sets `created_at` and `updated_at` timestamps.

#### Response

- HTTP 201 Created with success message.

#### Example Request Body

{
"name": "Client A",
"address": "123 Main St, City, Country"
}

---

### PATCH `/client`

Update an existing client's details.

#### Request Body

- `id` (integer, required) - Client ID to update.
- `name` (string, optional) - New client name.
- `address` (string, optional) - New client address; will be geocoded if updated.

#### Behavior

- Fetches existing client by `id`.
- If found, updates the name and/or address.
- Updates location with geocoded coordinates for new address.
- Updates `updated_at` timestamp.
- Returns error if client does not exist.

#### Response

- HTTP 204 No Content on success.
- HTTP 400 Bad Request if client not found.

#### Example Request Body

{
"id": 1,
"name": "Updated Client Name",
"address": "456 New Address, City, Country"
}

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

**Endpoint:** `PATCH /department`

Update information for an existing department.

### Request

JSON Body:

| Field                   | Type   | Required | Description                                  |
| ----------------------- | ------ | -------- | -------------------------------------------- |
| `departmentId`          | Number | Yes      | The unique ID of the department to update    |
| `departmentName`        | String | No       | New name of the department (max length: 100) |
| `departmentDescription` | String | No       | New description of the department            |

At least one of `departmentName` or `departmentDescription` must be provided.

**Example Request:**
{
"departmentId": 101,
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

**Endpoint:** `PATCH /contact`

Update details of an existing client contact.

### Request

JSON body:

| Field               | Type   | Required | Description                          |
| ------------------- | ------ | -------- | ------------------------------------ |
| `contactId`         | Number | Yes      | The ID of the contact to update      |
| `contactPersonName` | String | No       | Updated contact person's name        |
| `designation`       | String | No       | Updated contact person's designation |
| `phone`             | String | No       | Updated contact person's phone       |
| `email`             | String | No       | Updated contact person's email       |

**At least one of** `contactPersonName`, `designation`, `phone`, or `email` must be provided for updates.

**Example:**

{
"contactId": 42,
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

**Endpoint:** `DELETE /contact/:id`

Deletes a department by its unique ID.

### Request

Path Parameters:

| Parameter | Type   | Required | Description                         |
| --------- | ------ | -------- | ----------------------------------- |
| `id`      | Number | Yes      | The unique ID of the contact person |

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

## Notes

- All responses are in JSON format.
- All fields are strictly validated.
- Error messages are descriptive for troubleshooting.
- Transactions and database connection handling are robust.

---

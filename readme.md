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

This README provides a comprehensive overview for developers to use the client API endpoints effectively.

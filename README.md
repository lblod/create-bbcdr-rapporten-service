# create-bbcdr-rapporten-service
Microservice that creates a bbcdr report linked to the revelant metadata information from the active session. 

## installation
To add the service to your stack, add the following snippet to docker-compose.yml:

```
services:
  createreports:
    image: lblod/create-bbcdr-rapporten-service
```

The service requires the mu-session-id header to be present, this is typically provided by the [mu-identifier](https://github.com/mu-semtech/mu-identifier) service.

## REST API
### POST /bbcdr-reports/
Create a new bbcdr report

Returns `201 Created` if the report was created successfully.

Returns `400 Bad Request` if the request body is missing information.

Returns `401 Unauthorized` if the active session is missing information. It should contain at least the following information:
```
@prefix session: <http://mu.semte.ch/vocabularies/session/>.
@base <http://example.org/>.
<session> session:account <account>
<session> session:group <group>
<user> foaf:account <account>
```

This information is present when logged in via the [mock-login-service](https://github.com/lblod/mock-login-service).

Returns `500 Internal Server Error` if something else fails.

## Development

```
services:
  createreports:
    image: semtech/mu-javascript-template
    ports:
      - 8888:80
    environment:
      NODE_ENV: "development"
    volumes:
      - /path/to/your/code:/app/
```

import { app, query, update, uuid, sparqlEscapeString, sparqlEscapeDate, sparqlEscapeUri } from 'mu';
import { fetchSession, createReport, hasValidBody } from './support';
app.post('/bbcdr-rapporten/', async function( req, res ) {
  try {
  const sessionURI = req.headers['mu-session-id'];
  const activeSession = await fetchSession(sessionURI);
  const body = req.body;
    if (hasValidBody(body)) {
      const fileIdentifiers = body.data.relationships.files.data.map((obj) => obj.id);
      const report = createReport(activeSession, fileIdentifiers);
      res.status(201).send(report);
    }
    else {
      res.status(400).send({status: 400, title:'request is invalid'});
    }
  }
  catch(e) {
    console.error(e);
    res.status(500).send({status: 500, title: 'unexpected error while processing request'});
  }
});

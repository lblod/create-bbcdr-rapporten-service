import { app } from 'mu';
import { fetchSession, createReport, hasValidCreateBody, hasValidPatchBody, fetchReport, updateReport } from './support';
app.post('/bbcdr-reports/', async function( req, res ) {
  try {
    const sessionURI = req.headers['mu-session-id'];
    const activeSession = await fetchSession(sessionURI);
    if (activeSession) {
      const body = req.body;
      if (hasValidCreateBody(body)) {
        const fileIdentifiers = body.data.relationships.files.data.map((obj) => obj.id);
        const report = await createReport(activeSession, fileIdentifiers);
        res.status(201).send(report);
      }
      else {
        res.status(400).send({status: 400, title:'request is invalid'});
      }
    }
    else {
      res.status(401).send({status: 401, title: 'could not find an account linked to this session'});
    }
  }
  catch(e) {
    console.error(e);
    res.status(500).send({status: 500, title: 'unexpected error while processing request'});
  }
});

app.patch('/bbcdr-reports/:id', async function( req, res ) {
  try {
    const sessionURI = req.headers['mu-session-id'];
    const activeSession = await fetchSession(sessionURI);
    // bail out if we have no account
    if (!activeSession) {
      res.status(401).send({status: 401, title: 'could not find an account linked to this session'}).end();
    }

    const report = await fetchReport(req.params.id);
    // bail out if we can't find the report
    if (report.length === 0) {
      console.log(report);
      res.status(404).send({status: 404, title: 'not found'}).end();
    }

    const body = req.body;
    if (hasValidPatchBody(body)) {
      const updatedReport = await updateReport(report[0], req.params.id, body.data.relationships, activeSession);
      res.status(200).send(updatedReport);
    }
    else {
      res.status(400).send({status: 400, title: 'request is invalid'});
    }
  }
  catch(e) {
    console.error(e);
    res.status(500).send({status: 500, title: 'unexpected error while processing request'});
  }
});

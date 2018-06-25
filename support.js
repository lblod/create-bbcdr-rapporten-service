import { app, query, update, uuid, sparqlEscapeString, sparqlEscapeDateTime, sparqlEscapeUri } from 'mu';
const BASE_IRI = process.env.MU_BASE_IRI || "http://example.org/reports/";


/**
 * convert results of select query to an array of objects.
 * @method parseResult
 * @return {Array}
 */
const parseResult = function(result) {
  const bindingKeys = result.head.vars;
  return result.results.bindings.map((row) => {
    const obj = {};
    bindingKeys.forEach((key) => obj[key] = row[key].value);
    return obj;
  });
};

/**
 * fetch the current user and group linked to the SessionIRI
 *
 * @method fetchSession
 * @return {Object}
 */
const fetchSession = async function(sessionURI) {
  const result = await query(`
       PREFIX session: <http://mu.semte.ch/vocabularies/session/>
       PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
       PREFIX foaf: <http://xmlns.com/foaf/0.1/>
       PREFIX mu:   <http://mu.semte.ch/vocabularies/core/>

       SELECT ?user ?group ?userID ?groupID
       FROM <${process.env.MU_APPLICATION_GRAPH}>
       WHERE {
         ${sparqlEscapeUri(sessionURI)} (session:account / ^foaf:account) ?user;
                                        ext:sessionGroup  ?group.
         ?group mu:uuid ?groupID.
         ?user mu:uuid ?userID.
       }`);
  if (result.results.bindings.length === 0) {
    return null;
  }
  else {
    return parseResult(result)[0];
  }
};

/**
 * fetch a report and its properties based on its uuid
 * @method fetchReport
 */
const fetchReport = async function(reportId) {
  const result = await query(`
    PREFIX mu:   <http://mu.semte.ch/vocabularies/core/>
    PREFIX ext:   <http://mu.semte.ch/vocabularies/ext/>
    PREFIX nie:     <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>
    PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
    PREFIX dcterms: <http://purl.org/dc/terms/>
    PREFIX adms:    <http://www.w3.org/ns/adms#>
    PREFIX bbcdr: <http://mu.semte.ch/vocabularies/ext/bbcdr/>

    SELECT ?reportIRI ?status ?statusID ?created ?modified ?lastModifiedBy ?subject
    FROM <${process.env.MU_APPLICATION_GRAPH}>
    WHERE {
      ?reportIRI a bbcdr:Report;
                 adms:status ?status;
                 dcterms:created ?created;
                 dcterms:modified ?modified;
                 ext:lastModifiedBy ?lastModifiedBy;
                 dcterms:subject ?subject;
                 mu:uuid ${sparqlEscapeString(reportId)}.
     ?status mu:uuid ?statusID.
   }
  `);
  return parseResult(result);
};

const fetchFilesForReport = async function(reportIRI) {
  const files = await query(`
       PREFIX nie:     <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>
       PREFIX mu:   <http://mu.semte.ch/vocabularies/core/>
       PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
       PREFIX bbcdr: <http://mu.semte.ch/vocabularies/ext/bbcdr/>

       SELECT ?iri ?uuid
       FROM <${process.env.MU_APPLICATION_GRAPH}>
       WHERE {
         ${reportIRI} a bbcdr:Report;
               nie:hasPart ?iri.
         ?iri mu:uuid ?uuid.
       }`);
  return parseResult(files);
};
const fetchFiles = async function(fileIdentifiers) {
  const files = await query(`
       PREFIX mu:   <http://mu.semte.ch/vocabularies/core/>
       PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>

       SELECT ?file ?uuid
       FROM <${process.env.MU_APPLICATION_GRAPH}>
       WHERE {
         ?file a nfo:FileDataObject;
               mu:uuid ?uuid.
         FILTER(?uuid IN ( ${fileIdentifiers.map((id) => sparqlEscapeString(id)).join(',')}))
       }`);
  return parseResult(files);
};

const fetchStatus = async function(id) {
  const result = await query(`
       PREFIX mu:   <http://mu.semte.ch/vocabularies/core/>
       PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>

       SELECT ?concept
       FROM <${process.env.MU_APPLICATION_GRAPH}>
       WHERE {
         ?concept mu:uuid ${sparqlEscapeString(id)}.
      }
`);
  return parseResult(result)[0].concept;
};
const updateReport = async function(report, reportID, relationships, activeSession) {
  const deleteStatements = [];
  const insertStatements = [];
  const reportIRI = sparqlEscapeUri(report.reportIRI);
  const files = await fetchFilesForReport(reportIRI);
  let fileIdentifiers = files.map((file) => file.uuid);
  let statusID = report.statusID;
  if (relationships.files) {
    files.forEach((file) => deleteStatements.push(`${reportIRI} nie:hasPart ${sparqlEscapeUri(file.iri)}`));
    const newFiles = await fetchFiles(relationships.files.data.map((file) => file.id));
    fileIdentifiers = newFiles.map((file) => file.uuid);
    newFiles.forEach((file) => {
      insertStatements.push(`${reportIRI} nie:hasPart ${sparqlEscapeUri(file.file)}`);
    });
  }
  if (relationships.status) {
    deleteStatements.push(`${reportIRI} adms:status ${sparqlEscapeUri(report.status)}`);
    const status = await fetchStatus(relationships.status.data.id);
    statusID = relationships.status.data.id;
    insertStatements.push(`${reportIRI} adms:status ${sparqlEscapeUri(status)}`);
  }
  const now = new Date();
  await update(`
       PREFIX session: <http://mu.semte.ch/vocabularies/session>
       PREFIX foaf: <http://xmlns.com/foaf/0.1/>
       PREFIX mu:   <http://mu.semte.ch/vocabularies/core/>
       PREFIX ext:   <http://mu.semte.ch/vocabularies/ext/>
       PREFIX nie:     <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>
       PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
       PREFIX dcterms: <http://purl.org/dc/terms/>
       PREFIX adms:    <http://www.w3.org/ns/adms#>
       PREFIX bbcdr: <http://mu.semte.ch/vocabularies/ext/bbcdr/>

       WITH <${process.env.MU_APPLICATION_GRAPH}>
       DELETE {
          ${reportIRI} dcterms:modified ?modified;
                       dcterms:subject ?subject;
                       ext:lastModifiedBy ?lastModified.
          ${deleteStatements.join(".\n")}
       }
       INSERT {
          ${reportIRI} dcterms:modified ${sparqlEscapeDateTime(now)};
                       dcterms:subject ${sparqlEscapeUri(activeSession.group)};
                       ext:lastModifiedBy ${sparqlEscapeUri(activeSession.user)}.
          ${insertStatements.join(".\n")}
       }
       WHERE {
          ${reportIRI} dcterms:modified ?modified;
                       dcterms:subject ?subject;
                       ext:lastModifiedBy ?lastModified.
       }
`);
  return buildJSONAPIResponse(
    reportID,
    new Date(report.created),
    now,
    fileIdentifiers,
    statusID,
    activeSession.userID,
    activeSession.groupID
  );
};

const buildJSONAPIResponse = function(reportID, created, modified, fileIdentifiers, statusID, userID, groupID) {
  const filesJSON = fileIdentifiers.map( (id) => {
    return {
      links: {self: `/files/${id}`},
      data: {type: 'files', id: id}
    };
  });
  return {
    links: {
      self: `/bbcdr-reports/${reportID}`
    },
    data: {
      attributes: {
        created: created,
        modified: modified
      },
      relationships: {
        files: filesJSON,
        documentStatus: {
          "links": {
            "self": `/document-statuses/${statusID}`
          },
          "data": { "type": "document-statuses", "id": statusID }
        },
        gebruiker: {
          "links": {
            "self": `/gebruikers/${userID}`
          },
          "data": { "type": "gebruikers", "id": userID }
        },
        bestuurseenheid: {
          "links": {
            "self": `/bestuurseenheid/${groupID}`
          },
          "data": { "type": "bestuurseenheden", "id": groupID }
        }
      },
      id: reportID,
      type: 'bbcdr-reports'
    }
  };
};

/**
 * create the report, linked to the provided user, group and files
 *
 * @method createReport
 * @return {Object} json api representation of the created report
 */
const createReport = async function(activeSession, relationships) {
  const fileIdentifiers = relationships.files.data.map((obj) => obj.id);
  const id = uuid();
  const now = new Date();
  const reportIRI = `${BASE_IRI}${id}`;
  const draft = 'http://data.lblod.info/document-statuses/concept';
  const draftID = 'concept';
  let status, statusID;
  if (relationships.status) {
    status = await fetchStatus(relationships.status.data.id);
    statusID = relationships.status.data.id;
  }
  else {
    status = draft;
    statusID = draftID;
  }

  const withFiles = fileIdentifiers.length > 0;
  await update(`
       PREFIX session: <http://mu.semte.ch/vocabularies/session>
       PREFIX foaf: <http://xmlns.com/foaf/0.1/>
       PREFIX mu:   <http://mu.semte.ch/vocabularies/core/>
       PREFIX ext:   <http://mu.semte.ch/vocabularies/ext/>
       PREFIX nie:     <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>
       PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
       PREFIX dcterms: <http://purl.org/dc/terms/>
       PREFIX adms:    <http://www.w3.org/ns/adms#>
       PREFIX bbcdr: <http://mu.semte.ch/vocabularies/ext/bbcdr/>

       WITH <${process.env.MU_APPLICATION_GRAPH}>
       ${withFiles ? 'INSERT' : 'INSERT DATA'} {
         ${sparqlEscapeUri(reportIRI)} a bbcdr:Report;
                               adms:status ${sparqlEscapeUri(status)};
                               dcterms:created ${sparqlEscapeDateTime(now)};
                               dcterms:modified ${sparqlEscapeDateTime(now)};
                               ext:lastModifiedBy ${sparqlEscapeUri(activeSession.user)};
                               dcterms:subject ${sparqlEscapeUri(activeSession.group)};
                               ${withFiles ? 'nie:hasPart ?file;' : ''}
                               mu:uuid ${sparqlEscapeString(id)}.
       }
       ${withFiles ?
       `
       WHERE {
         ?file a nfo:FileDataObject;
               mu:uuid ?uuid.
         FILTER(?uuid IN ( ${fileIdentifiers.map((id) => sparqlEscapeString(id)).join(',')}))
       }`
       :
       ''
       }`);
  return buildJSONAPIResponse(id, now, now, fileIdentifiers, statusID, activeSession.userID, activeSession.groupID );
};

const hasValidBody = function(body) {
  if (!body.data) return false;
  const data = body.data;
  if (data.type !== "bbcdr-reports") return false;
  return true;
};

/**
 * validate the request body
 */
const hasValidPatchBody = function(body) {
  if(!hasValidBody(body)) return false;
  if(!body.data.id) return false;
  if (body.data.relationships && body.data.relationships.files) {
    if(!body.data.relationships.files.data || !body.data.relationships.files.data instanceof Array)
      return false;
  }
  if (body.data.relationships && body.data.relationships.status) {
    if(!body.data.relationships.status.data)
      return false;
  }
  return true;
};

/**
 * Validate the request body
 *
 * @method hasValidBody
 * @return {boolean}
 */
const hasValidCreateBody = function(body) {
  if (!hasValidBody(body)) return false;
  if (!body.data.relationships) return false;
  if (!body.data.relationships.files) return false;
  return true;
};

export { hasValidCreateBody, hasValidPatchBody, fetchSession, createReport, fetchReport, updateReport };

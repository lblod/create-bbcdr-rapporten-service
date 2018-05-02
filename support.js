import { app, query, update, uuid, sparqlEscapeString, sparqlEscapeDateTime, sparqlEscapeUri } from 'mu';
const BASE_IRI = process.env.MU_BASE_IRI || "http://example.org/reports/";

/**
 * fetch the current user and group linked to the SessionIRI
 *
 * @method fetchSession
 * @return {Object}
 */
const  fetchSession = async function(sessionURI) {
  const result = await query(`
       PREFIX session: <http://mu.semte.ch/vocabularies/session/>
       PREFIX foaf: <http://xmlns.com/foaf/0.1/>
       PREFIX mu:   <http://mu.semte.ch/vocabularies/core/>
       SELECT ?user ?group ?userID ?groupID
       FROM <http://mu.semte.ch/application>
       WHERE {
         ${sparqlEscapeUri(sessionURI)} (session:account / ^foaf:account) ?user;
                                        session:group  ?group.
         ?group mu:uuid ?groupID.
         ?user mu:uuid ?userID.
       }`);
  if (result.results.bindings.length === 0) {
    return null;
  }
  else {
    const r = result.results.bindings[0];
    return { user: r.user.value, group: r.group.value, groupID: r.groupID.value, userID: r.userID.value};
  }
};

/**
 * create the report, linked to the provided user, group and files
 *
 * @method createReport
 * @return {Object} json api representation of the created report
 */
const createReport = async function(activeSession, fileIdentifiers) {
  const id = uuid();
  const now = new Date();
  const reportIRI = `${BASE_IRI}/${id}`;
  const draft = 'http://data.lblod.info/document-statuses/concept';
  const draftID = 'concept';
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
       WITH <http://mu.semte.ch/application>
       ${withFiles ? 'INSERT' : 'INSERT DATA'} {
         ${sparqlEscapeUri(reportIRI)} a bbcdr:Report;
                               adms:status ${sparqlEscapeUri(draft)};
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
         ?file a nfo:FileDateObject;
               mu:uuid ?uuid.
         FILTER(?uuid IN ( ${fileIdentifiers.map((id) => sparqlEscapeString(id)).join(',')}))
       }`
       :
       ''
       }`);
  const filesJSON = fileIdentifiers.map( (id) => {
    return {
      links: {self: `/files/${id}`},
      data: {type: 'files', id: id}
    };
  });
  return {
    links: {
      self: `/bbcdr-reports/${id}`
    },
    data: {
      attributes: {
        created: now,
        modified: now
      },
      relationships: {
        files: filesJSON,
        documentStatus: {
          "links": {
            "self": `/document-statuses/${draftID}`
          },
          "data": { "type": "document-statuses", "id": draftID }
        },
        gebruiker: {
          "links": {
            "self": `/gebruikers/${activeSession.userID}`
          },
          "data": { "type": "gebruikers", "id": activeSession.userID }
        },
        bestuurseenheid: {
          "links": {
            "self": `/bestuurseenheid/${activeSession.groupID}`
          },
          "data": { "type": "bestuurseenheden", "id": activeSession.groupID }
        }
      },
      id: id,
      type: 'bbcdr-reports'
    }
  };
};

/**
 * Validate the request body
 *
 * @method hasValidBody
 * @return {boolean}
 */
const hasValidBody = function(body) {
  if (!body.data) return false;
  const data = body.data;
  if (data.type !== "bbcdr-reports") return false;
  if (!body.data.relationships) return false;
  if (!body.data.relationships.files) return false;
  return true;
};

export { hasValidBody, fetchSession, createReport };

import { app, query, update, uuid, sparqlEscapeString, sparqlEscapeDate, sparqlEscapeUri } from 'mu';
const BASE_IRI = process.env.MU_BASE_IRI || "http://example.org/reports/";

/**
 * fetch the current user and group linked to the SessionIRI
 *
 * @method fetchSession
 * @return {Object}
 */
const  fetchSession = async function(sessionURI) {
  const result = await query(`
       PREFIX session: <http://mu.semte.ch/vocabularies/session>
       PREFIX foaf: <http://xmlns.com/foaf/0.1/>
       PREFIX mu:   <http://mu.semte.ch/vocabularies/core/>
       SELECT ?user ?group ?userID ?groupID
       WHERE {
         ${sparqlEscapeUri(sessionURI)} a session:Session;
                                        (session:account / ^foaf:account) ?user;
                                        foaf:member  ?group.
         ?group mu:uuid ?groupID.
         ?user mu:uuid ?userID.
       }`);
  console.log(result);
  return result[0];
};

/**
 * create the report, linked to the provided user, group and files
 *
 * @method createReport
 * @return 
 */
const createReport = async function(activeSession, fileIdentifiers) {
  const uuid = uuid();
  const now = new Date();
  const reportIRI = `${BASE_IRI}/${uuid}`;
  const draftID = '';
  const draft = '';
  await update(`
       PREFIX session: <http://mu.semte.ch/vocabularies/session>
       PREFIX foaf: <http://xmlns.com/foaf/0.1/>
       PREFIX mu:   <http://mu.semte.ch/vocabularies/core/>
       INSERT {
         ${sparqlEscapeUri(reportIRI)} a ${{bbcdr:Report}};
                               dcterms:created ${sparqlEscapeDate(now)};
                               dcterms:modified ${sparqlEscapeDate(now)};
                               adms:status ${sparqlEscapeUri(draft)};
                               ext:lastModifiedBy ${sparqlEscapeUri(activeSession.user)};
                               dcterms:subject ${sparqlEscapeUri(activeSession.group)};
                               nie:hasPart ?file.
       WHERE {
         ?file a nfo:FileDateObject;
               mu:uuid ?uuid.
         FILTER(?uuid IN ( ${fileIdentifiers.map((id) => sparqlEscapeString(id)).join(',')}));
       }`);
  const filesJSON = fileIdentifiers.map( (id) => {
    return {
      links: {self: `/files/${id}`},
      data: {type: 'files', id: id}
    };
  });
  return {
    links: {
      self: `/bbcdr-rapporten/${uuid}`
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
            "self": `/gebruikers/${activeSession.groupID}`
          },
          "data": { "type": "bestuurseenheden", "id": activeSession.groupID }
        }
      },
      id: uuid,
      type: 'bbcdr-rapporten'
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
  console.log(data);
  if (data.type !== "bbcdr-rapporten") return false;
  if (!body.data.relationships) return false;
  if (!body.data.relationships.files) return false;
  return true;
};

export { hasValidBody, fetchSession, createReport };

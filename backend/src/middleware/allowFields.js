function createUnexpectedFieldsError(location, fields) {
  const plural = fields.length === 1 ? "" : "s";
  const error = new Error(
    `Unexpected ${location} field${plural}: ${fields.join(", ")}.`
  );
  error.statusCode = 400;
  return error;
}

function rejectUnexpectedFields(source, location, allowedFields) {
  const allowed = new Set(allowedFields);
  const unexpected = Object.keys(source || {}).filter((field) => !allowed.has(field));

  if (unexpected.length > 0) {
    throw createUnexpectedFieldsError(location, unexpected);
  }
}

export function allowBodyFields(fields = []) {
  return (req, res, next) => {
    try {
      rejectUnexpectedFields(req.body, "body", fields);
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function allowQueryFields(fields = []) {
  return (req, res, next) => {
    try {
      rejectUnexpectedFields(req.query, "query", fields);
      next();
    } catch (err) {
      next(err);
    }
  };
}

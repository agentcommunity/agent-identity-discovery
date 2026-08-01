import { URL } from 'node:url';

function urlsIn(contents) {
  return contents.match(/https:\/\/[^\s<>'"`\])}]+/g) ?? [];
}

function parseUrl(candidate) {
  try {
    return new URL(candidate);
  } catch {
    return null;
  }
}

export function containsExactUrl(contents, expectedUrl) {
  const expected = new URL(expectedUrl);
  return urlsIn(contents).some(function (candidate) {
    const parsed = parseUrl(candidate);
    return parsed !== null
      && parsed.protocol === expected.protocol
      && parsed.username === ''
      && parsed.password === ''
      && parsed.hostname === expected.hostname
      && parsed.port === expected.port
      && parsed.pathname === expected.pathname
      && parsed.search === expected.search
      && parsed.hash === expected.hash;
  });
}

export function containsExactHost(contents, expectedHost) {
  return urlsIn(contents).some(function (candidate) {
    const parsed = parseUrl(candidate);
    return parsed !== null
      && parsed.protocol === 'https:'
      && parsed.username === ''
      && parsed.password === ''
      && parsed.hostname === expectedHost
      && parsed.port === '';
  });
}

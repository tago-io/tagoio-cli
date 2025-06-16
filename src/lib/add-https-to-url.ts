/**
 * Add https to the url if it doesn't have it
 * If the url is already https, return the url
 * @param url - The url to add https to
 * @returns The url with https
 */
function addHttpsToUrl(url: string): string {
  if (!url) {
    return "";
  }

  if (!url.startsWith("https://")) {
    return `https://${url}`;
  }
  return url;
}

export { addHttpsToUrl };
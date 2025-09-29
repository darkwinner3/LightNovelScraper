const fetch = require('node-fetch');
const { parseDocument } = require('htmlparser2');
const { findAll, getText } = require('domutils');
const { URL } = require('url');
const { decode } = require('html-entities');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');

const { getCorrectOlElement } = require('./olElementGetter');

const API_URL = 'https://jnovels.com/wp-json/wp/v2/posts';
const PER_PAGE = 100;

const allPdfLinks = new Set();

const seriesDB = checkDatabaseExists();


function getWebsitePage(jsonPage, postIndexOnJsonPage, postsPerPageOnJson, postsPerPageOnWebsite) {
  const globalPostIndex = (jsonPage - 1) * postsPerPageOnJson + postIndexOnJsonPage;
  
  const websitePage = Math.ceil(globalPostIndex / postsPerPageOnWebsite);
  
  return websitePage;
}

function checkDatabaseExists() {
  let seriesDB = [];
  let databaseExists = fs.existsSync('Database Files/seriesDB.json');
  
  if (databaseExists) {
      seriesDB = JSON.parse(fs.readFileSync('Database Files/seriesDB.json', 'utf8'));
  }
  return seriesDB;
}

async function extractSlugFromUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.pathname.replace(/^\/|\/$/g, '');
  } catch {
    return '';
  }
}

async function extractPdfLinks(content, postIndexOnJsonPage, title, page) {
  const regex = /https?:\/\/[^"'>\s]+pdf[^"'>\s]*/gi;

  if (content.includes('<!--more--')) {
    const websitePageNum = getWebsitePage(page, postIndexOnJsonPage + 1, PER_PAGE, 6);
  const webpageLink = `https://jnovels.com/page/${websitePageNum}/`;

  try {
    // Fetch the webpage content
    const { data } = await axios.get(webpageLink);

    // Load the HTML into cheerio
    const $ = cheerio.load(data);

    // Find the post link based on the title
    let postLink = null;

    $('.post-container').each((i, post) => {
      const postTitleElement = $(post).find('.post-title a');
      if (postTitleElement && postTitleElement.text().includes(title)) {
        const links = $(post).find('a');
        
        // Find the "Refer to Original Post" link
        const referToOriginalPostLink = links.toArray().find(a => $(a).text().includes('Refer to Original Post'));
        if (!referToOriginalPostLink) {
          // If no refer link, look for "Continue reading"
          const continueReadingLink = links.toArray().find(a => $(a).text().includes('Continue reading'));
          if (continueReadingLink) {
            postLink = $(continueReadingLink).attr('href');
          }
        }
      }
    });

    if (postLink) {
      content += postLink;
    }
  } catch (error) {
    console.error("Error scraping the page:", error);
    return null;
  }}

  const allLinks = content.match(regex) || [];

  let filtered = allLinks.filter(link => {
    const lc = link.toLowerCase();

    const hasAllVolume = lc.includes('-all-volume');
    const hasNovelsVolume = lc.includes('-novels-volume');
    const hasVolume = /-volume-(\d+)?/.test(lc);

    if (hasVolume && !hasAllVolume && !hasNovelsVolume) return false;

    return true;
  });



  return filtered;
}

function countDownloadLinks(seriesName, html) {
  const doc = parseDocument(html);

  // Get the result object from checkerFromHTML
  const result = getCorrectOlElement(seriesName, doc);

  let anchors = [];

  // Pull out only the relevant <ol> elements
  const filteredOlElements = result?.ols ?? [];

  if (filteredOlElements.length > 0) {
    // Count <a> tags inside only the filtered <ol> elements
    for (let ol of filteredOlElements) {
      const links = findAll(el =>
        el.name === 'a' &&
        el.attribs?.href &&
        (() => {
          const text = getText(el).toLowerCase();
          return text.includes('volume') || text.includes('download');
        })(),
        [ol]
      );
      anchors.push(...links);
    }
  } else {
    // Fall back to counting all <a> tags in the full document
    anchors = findAll(el =>
      el.name === 'a' &&
      el.attribs?.href &&
      (() => {
        const text = getText(el).toLowerCase();
        return text.includes('volume') || text.includes('download');
      })(),
      doc.children
    );
  }

  return anchors.length;
}

async function fetchPostBySlug(slug, originalUrl) {
  try {
    const res = await fetch(`${API_URL}?slug=${slug}&_fields=title,link,content`);
    if (res.ok) {
      const json = await res.json();
      if (json.length > 0) return json[0];
    }
  } catch (err) {
    console.error('Failed to fetch initial slug:', err);
  }

  // If first slug fails, resolve correct slug from original link
  try {
    const redirectRes = await fetch(originalUrl, {
      method: 'HEAD',
      redirect: 'follow',
    });

    const finalUrl = redirectRes.url;
    const correctedSlug = new URL(finalUrl).pathname.replace(/^\/|\/$/g, '');

    if (correctedSlug && correctedSlug !== slug) {
      const retryRes = await fetch(`${API_URL}?slug=${correctedSlug}&_fields=title,link,content`);
      if (retryRes.ok) {
        const retryJson = await retryRes.json();
        if (retryJson.length > 0) {
          console.log(`Corrected slug: ${slug} → ${correctedSlug}`);
          return retryJson[0];
        }
      }
    }
  } catch (err) {
    console.error(`Failed to resolve slug via redirect for: ${originalUrl}`);
  }

  return null;
}

function sanitizeSeriesName(rawTitle) {
  return decode(rawTitle)
    .replace(/webnovel/gi, '')
    .replace(/[\[\]]/g, '')
    .replace(/(light novel|pdf|epub|complete|download|all novels|all volumes|all vol|all volume|volumes|downoad)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}
async function processPosts() {
  let page = 1;

  while (true) {
    console.log(`Fetching page ${page}`);
    const res = await fetch(`${API_URL}?page=${page}&per_page=${PER_PAGE}&_fields=content,title`);
    if (!res.ok) break;

    const posts = await res.json();
    if (posts.length === 0) break;

    for (let postIndexOnJsonPage = 0; postIndexOnJsonPage < posts.length; postIndexOnJsonPage++) {
      const post = posts[postIndexOnJsonPage];
      const content = post.content.rendered;
      const title = post.title.rendered;
      let sanitizedTitle = seriesDB.find(s => title.toLowerCase().includes(s.seriesName.toLowerCase()));
      if (sanitizedTitle) {
        console.log(`Skipping series: ${sanitizedTitle.seriesName}`);
        continue;
      }
      const pdfLinks = await extractPdfLinks(content, postIndexOnJsonPage, title, page);

      await Promise.all(
        pdfLinks.map(async (link) => {
          if (allPdfLinks.has(link)) {
            console.log(`${link} already exists.`);
            return;
          }
          allPdfLinks.add(link);

          const slug = await extractSlugFromUrl(link);
          
          const postData = await fetchPostBySlug(slug, link);
          

          if (!postData) {
            console.warn(`Could not fetch post for slug: ${slug}`);
            return;
          }

          const seriesName = sanitizeSeriesName(postData.title.rendered);
          const seriesLink = postData.link;
          const availableVolumes = countDownloadLinks(seriesName, postData.content.rendered);

          let series = seriesDB.find(s => s.seriesName === seriesName);

          console.log('Looking for:', seriesName);

          if (seriesName === 'Jobless Reincarnation' || seriesLink.toLowerCase().includes( 'webnovel')
             || seriesName.toLowerCase().includes('manga') || seriesName.toLowerCase().includes('avatar')){
            return;
          }

          if (series) {
            if (series.availableVolumes !== availableVolumes) {
              console.log(`Updating ${seriesName}: ${series.availableVolumes} → ${availableVolumes}`);
              series.availableVolumes = availableVolumes;
            }
          } else {
            seriesDB.push({
              seriesName,
              availableVolumes,
              downloadedVolumes: 0,
              seriesLink
            });
            console.log(`Added: ${seriesName} (${availableVolumes} volumes)`);
          }
        }));
      }
    if (posts.length < PER_PAGE) break;
    page++;
  }
  fs.writeFileSync('Database Files/seriesDB.json', JSON.stringify(seriesDB, null, 2));
  console.log(`Done. Extracted ${seriesDB.length} entries.`);
}

processPosts();

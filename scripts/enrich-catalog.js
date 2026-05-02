#!/usr/bin/env node

const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const API_BASE_URL = 'https://api.imdbapi.dev';
const REQUEST_DELAY_MS = 450;

const catalogs = {
  movies: {
    label: 'movie',
    listPath: path.join(ROOT_DIR, 'data/movies.json'),
    detailsPath: path.join(ROOT_DIR, 'data/movies_details.json'),
    posterDir: path.join(ROOT_DIR, 'MoviesPoster'),
    posterPathPrefix: './MoviesPoster',
    acceptedTypes: new Set(['movie', 'tvMovie', 'short', 'video']),
  },
  tv: {
    label: 'TV show',
    listPath: path.join(ROOT_DIR, 'data/tv_shows.json'),
    detailsPath: path.join(ROOT_DIR, 'data/tv_show_details.json'),
    posterDir: path.join(ROOT_DIR, 'TvShowsPoster'),
    posterPathPrefix: './TvShowsPoster',
    acceptedTypes: new Set(['tvSeries', 'tvMiniSeries', 'tvSpecial']),
  },
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const readJson = async (filePath) => JSON.parse(await fs.readFile(filePath, 'utf8'));

const writeJson = async (filePath, data) => {
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
};

const getNextId = (items) => Math.max(0, ...items.map((item) => Number(item.id) || 0)) + 1;

const names = (value) => {
  if (!Array.isArray(value)) return '';

  return value
    .map((item) => {
      if (typeof item === 'string') return item;
      return item.displayName || item.primaryName || item.name || item.id || '';
    })
    .filter(Boolean)
    .join(', ');
};

const runtime = (seconds) => {
  if (!seconds) return 'Unknown runtime';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);

  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
};

const countryNames = (countries) => names(countries) || 'Unknown';

const DEFAULT_TAG_NAME = 'Entertainment';

const fetchJson = async (url) => {
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'MovieMenu catalog enricher',
    },
  });

  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }

  return response.json();
};

const imdbTitleUrl = (imdbId) => `${API_BASE_URL}/titles/${imdbId}`;

const searchTitle = async (entry, config) => {
  const query = encodeURIComponent(`${entry.title_name} ${entry.release_year || ''}`.trim());
  const data = await fetchJson(`${API_BASE_URL}/search/titles?query=${query}`);
  const titles = data.titles || [];
  const releaseYear = Number(entry.release_year) || 0;
  const normalizedTitle = normalizeText(entry.title_name);

  const candidates = titles
    .filter((title) => title.id && config.acceptedTypes.has(title.type))
    .map((title) => ({
      title,
      score: scoreSearchResult(title, normalizedTitle, releaseYear),
    }))
    .sort((first, second) => second.score - first.score);

  return candidates[0]?.score > 0 ? candidates[0].title : null;
};

const normalizeText = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const scoreSearchResult = (title, wantedTitle, wantedYear) => {
  let score = 0;
  const resultTitle = normalizeText(title.primaryTitle || title.originalTitle);
  const resultYear = Number(title.startYear) || 0;

  if (resultTitle === wantedTitle) score += 80;
  if (resultTitle.includes(wantedTitle) || wantedTitle.includes(resultTitle)) score += 30;
  if (wantedYear && resultYear === wantedYear) score += 50;
  if (wantedYear && Math.abs(resultYear - wantedYear) === 1) score += 10;
  if (title.type === 'movie' || title.type === 'tvSeries') score += 5;

  return score;
};

const buildDetailsEntry = (title, nextId, existing = {}) => {
  const rating = Number(title.rating?.aggregateRating) || Number(title.rating) || 0;
  const director = names(title.directors) || names(title.creators) || names(title.writers) || 'Unknown director';

  return {
    id: existing.id || nextId,
    actor: existing.actor || names(title.stars) || 'Unknown actors',
    country_of_origin: existing.country_of_origin || countryNames(title.originCountries || title.countriesOfOrigin),
    director: existing.director || director,
    genre: existing.genre || names(title.genres) || 'Unknown genre',
    movie_id: title.id,
    oscar_nominations: Number(existing.oscar_nominations) || 0,
    oscar_wins: Number(existing.oscar_wins) || 0,
    personal_review: existing.personal_review ?? null,
    poster_image_name: `${title.id}.jpg`,
    rating,
    release_year: Number(title.startYear) || Number(existing.release_year) || 0,
    runtime: existing.runtime || runtime(title.runtimeSeconds),
    spoken_languages: existing.spoken_languages || names(title.spokenLanguages) || 'Unknown',
    summary: existing.summary || title.plot || 'No summary available.',
    tagname: existing.tagname || DEFAULT_TAG_NAME,
    title_name: title.primaryTitle || existing.title_name || 'Unknown title',
    ...(title.type ? { type: title.type } : {}),
    ...(title.endYear ? { end_year: Number(title.endYear) } : {}),
  };
};

const posterFiles = (config, imdbId) => ({
  jpg: path.join(config.posterDir, `${imdbId}.jpg`),
  webp: path.join(config.posterDir, `${imdbId}.webp`),
});

const fileExists = async (filePath) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const ensurePoster = async (title, config) => {
  const files = posterFiles(config, title.id);
  const hasJpg = await fileExists(files.jpg);
  const hasWebp = await fileExists(files.webp);

  if (hasJpg && hasWebp) return false;

  const posterUrl = title.primaryImage?.url;

  if (!posterUrl) {
    console.warn(`No poster URL for ${title.id} (${title.primaryTitle || 'unknown title'})`);
    return false;
  }

  await fs.mkdir(config.posterDir, { recursive: true });

  const response = await fetch(posterUrl, {
    headers: {
      accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'user-agent': 'MovieMenu catalog enricher',
    },
  });

  if (!response.ok) {
    throw new Error(`Poster download for ${title.id} returned ${response.status}`);
  }

  const tempFile = path.join(os.tmpdir(), `${title.id}-${Date.now()}`);
  await fs.writeFile(tempFile, Buffer.from(await response.arrayBuffer()));

  try {
    convertPoster(tempFile, files.jpg, 'mjpeg');
    convertPoster(tempFile, files.webp, 'libwebp');
  } finally {
    await fs.rm(tempFile, { force: true });
  }

  return true;
};

const convertPoster = (sourcePath, outputPath, codec) => {
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', sourcePath];

  if (codec === 'libwebp') {
    args.push('-vf', 'scale=600:-1', '-c:v', 'libwebp', '-quality', '84', outputPath);
  } else {
    args.push('-vf', 'scale=600:-1', '-c:v', 'mjpeg', '-q:v', '3', outputPath);
  }

  const result = spawnSync('ffmpeg', args, { encoding: 'utf8' });

  if (result.status !== 0) {
    throw new Error(`ffmpeg could not create ${path.basename(outputPath)}: ${result.stderr || result.error?.message}`);
  }
};

const enrichCatalog = async (catalogKey, config) => {
  const list = await readJson(config.listPath);
  const details = await readJson(config.detailsPath);
  const detailsByImdbId = new Map(details.filter((item) => item.movie_id).map((item) => [item.movie_id, item]));
  let nextListId = getNextId(list);
  let nextDetailsId = getNextId(details);
  let changedList = false;
  let changedDetails = false;
  let downloadedPosters = 0;

  for (const entry of list) {
    if (!entry.id) {
      entry.id = nextListId;
      nextListId += 1;
      changedList = true;
    }

    let title = null;

    if (!entry.movie_id) {
      if (!entry.title_name || !entry.release_year) {
        console.warn(`Skipping ${config.label} entry without movie_id because title_name or release_year is missing.`);
        continue;
      }

      console.log(`Searching IMDb for ${entry.title_name} (${entry.release_year})...`);
      const searchResult = await searchTitle(entry, config);
      await wait(REQUEST_DELAY_MS);

      if (!searchResult) {
        console.warn(`No IMDb match found for ${entry.title_name} (${entry.release_year}).`);
        continue;
      }

      entry.movie_id = searchResult.id;
      changedList = true;
      title = await fetchJson(imdbTitleUrl(searchResult.id));
      await wait(REQUEST_DELAY_MS);
    } else {
      const files = posterFiles(config, entry.movie_id);
      const detailExists = detailsByImdbId.has(entry.movie_id);
      const posterMissing = !(await fileExists(files.jpg)) || !(await fileExists(files.webp));

      if (!detailExists || posterMissing) {
        title = await fetchJson(imdbTitleUrl(entry.movie_id));
        await wait(REQUEST_DELAY_MS);
      }
    }

    if (!title) continue;

    entry.title_name = title.primaryTitle || entry.title_name;
    entry.release_year = Number(title.startYear) || Number(entry.release_year) || 0;
    changedList = true;

    if (!detailsByImdbId.has(title.id)) {
      const detail = buildDetailsEntry(title, nextDetailsId);
      details.push(detail);
      detailsByImdbId.set(title.id, detail);
      nextDetailsId += 1;
      changedDetails = true;
    } else {
      const detail = detailsByImdbId.get(title.id);

      if (detail.poster_image_name !== `${title.id}.jpg`) {
        detail.poster_image_name = `${title.id}.jpg`;
        changedDetails = true;
      }
    }

    if (await ensurePoster(title, config)) {
      downloadedPosters += 1;
    }

    const files = posterFiles(config, title.id);
    const hasLocalPoster = (await fileExists(files.webp)) || (await fileExists(files.jpg));

    if (hasLocalPoster) {
      entry.poster_image_path = `${config.posterPathPrefix}/${title.id}.webp`;
      changedList = true;
    } else if (entry.poster_image_path?.includes(title.id)) {
      entry.poster_image_path = '';
      changedList = true;
    }
  }

  if (changedList) await writeJson(config.listPath, list);
  if (changedDetails) await writeJson(config.detailsPath, details);

  return {
    catalogKey,
    listChanged: changedList,
    detailsChanged: changedDetails,
    downloadedPosters,
  };
};

const main = async () => {
  const requestedCatalog = process.argv[2];
  const entries = requestedCatalog ? [[requestedCatalog, catalogs[requestedCatalog]]] : Object.entries(catalogs);

  if (requestedCatalog && !catalogs[requestedCatalog]) {
    throw new Error(`Unknown catalog "${requestedCatalog}". Use "movies", "tv", or no argument for both.`);
  }

  const results = [];

  for (const [catalogKey, config] of entries) {
    results.push(await enrichCatalog(catalogKey, config));
  }

  results.forEach((result) => {
    console.log(
      `${result.catalogKey}: list ${result.listChanged ? 'updated' : 'unchanged'}, details ${
        result.detailsChanged ? 'updated' : 'unchanged'
      }, posters downloaded ${result.downloadedPosters}`
    );
  });
};

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

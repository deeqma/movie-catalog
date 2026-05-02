const gallery = document.querySelector('#movie-gallery');
const modal = document.querySelector('#movie-modal');
const modalBody = document.querySelector('#modal-body');
const closeModalButton = document.querySelector('#close-modal');
const toggleButtons = document.querySelectorAll('.toggle-button');
const filterToggle = document.querySelector('#filter-toggle');
const searchFilter = document.querySelector('#search-filter');
const tagFilter = document.querySelector('#tag-filter');
const ratingFilter = document.querySelector('#rating-filter');
const genreFilter = document.querySelector('#genre-filter');
const oscarFilter = document.querySelector('#oscar-filter');
const clearFiltersButton = document.querySelector('#clear-filters');

const state = {
  activeMedia: 'movies',
  lastFilterKey: '',
  visibleTitlesByKey: new Map(),
  libraries: {
    movies: [],
    tv: [],
  },
};

const getFilterKey = () =>
    [
      state.activeMedia,
      searchFilter.value.trim().toLowerCase(),
      tagFilter.value,
      ratingFilter.value,
      genreFilter.value,
      oscarFilter.value,
    ].join('|');

const hasActiveFilters = () =>
    Boolean(searchFilter.value.trim()) ||
    Boolean(tagFilter.value) ||
    Boolean(ratingFilter.value) ||
    Boolean(genreFilter.value) ||
    Boolean(oscarFilter.value);

const mediaConfig = {
  movies: {
    listUrl: './data/movies.json',
    detailsUrl: './data/movies_details.json',
    posterDir: 'MoviesPoster',
    label: 'Movie',
  },
  tv: {
    listUrl: './data/tv_shows.json',
    detailsUrl: './data/tv_show_details.json',
    posterDir: 'TvShowsPoster',
    label: 'TV Show',
  },
};

const normalizeTitle = (details, mediaType, listEntry = {}) => {
  const item = { ...listEntry, ...details };

  return {
    id: item.id,
    imdbId: item.movie_id,
    key: `${mediaType}:${item.movie_id || item.id}`,
    posterImageName: item.poster_image_name || '',
    posterImagePath: item.poster_image_path || '',
    searchableText: [
      item.title_name,
      item.actor,
      item.director,
      item.genre,
      item.tagname,
      item.release_year,
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase(),
    mediaType,
    title: item.title_name || 'Unknown title',
    genre: item.genre || 'Unknown genre',
    genres: splitGenres(item.genre),
    runtime: item.runtime || 'Unknown runtime',
    releaseYear: Number(item.release_year) || 0,
    endYear: Number(item.end_year) || null,
    rating: Number(item.rating) || 0,
    director: item.director || 'Unknown director',
    actor: item.actor || 'Unknown actors',
    summary: item.summary || 'No summary available.',
    spokenLanguages: item.spoken_languages || 'Unknown',
    countryOfOrigin: item.country_of_origin || 'Unknown',
    oscarWins: Number(item.oscar_wins) || 0,
    oscarNominations: Number(item.oscar_nominations) || 0,
    personalReview: item.personal_review || '',
    tagName: item.tagname || 'Untagged',
    type: item.type || mediaConfig[mediaType].label,
  };
};

const buildLibrary = (list, details, mediaType) => {
  const listByImdbId = new Map(list.filter((item) => item.movie_id).map((item) => [item.movie_id, item]));
  const detailsByImdbId = new Map(details.filter((item) => item.movie_id).map((item) => [item.movie_id, item]));
  const matchedTitles = [];
  const missingDetails = [];
  const missingListEntries = [];

  listByImdbId.forEach((listEntry, imdbId) => {
    const detail = detailsByImdbId.get(imdbId);

    if (!detail) {
      missingDetails.push(imdbId);
      return;
    }

    matchedTitles.push(normalizeTitle(detail, mediaType, listEntry));
  });

  detailsByImdbId.forEach((_, imdbId) => {
    if (!listByImdbId.has(imdbId)) missingListEntries.push(imdbId);
  });

  if (missingDetails.length || missingListEntries.length) {
    console.warn(`${mediaConfig[mediaType].label} JSON mismatch`, {
      missingDetails,
      missingListEntries,
    });
  }

  return matchedTitles;
};

const getPosterSources = (item) => {
  const posterDir = mediaConfig[item.mediaType].posterDir;
  const candidates = [
    item.posterImagePath && replaceImageExtension(item.posterImagePath, 'webp'),
    item.posterImagePath,
    item.posterImageName && `./${posterDir}/${replaceImageExtension(item.posterImageName, 'webp')}`,
    item.posterImageName && `./${posterDir}/${item.posterImageName}`,
    item.imdbId && `./${posterDir}/${item.imdbId}.webp`,
    item.imdbId && `./${posterDir}/${item.imdbId}.jpg`,
  ].filter(Boolean);

  return [...new Set(candidates)];
};

const replaceImageExtension = (filePath, extension) => filePath.replace(/\.(jpe?g|png|webp)$/i, `.${extension}`);

const splitGenres = (genre) =>
    String(genre || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

const createPosterFallback = (item) => {
  const fallback = document.createElement('div');
  fallback.className = 'poster-fallback';
  fallback.innerHTML = `
    <h2>${escapeHtml(item.title)}</h2>
    <p>${escapeHtml(item.genre)}</p>
    <p>${escapeHtml(item.runtime)}</p>
    <p>${escapeHtml(formatYears(item))}</p>
  `;
  return fallback;
};

const createPoster = (item) => {
  const posterFrame = document.createElement('div');
  posterFrame.className = 'poster-frame';

  const posterSources = getPosterSources(item);

  if (!posterSources.length && !item.imdbId) {
    posterFrame.appendChild(createPosterFallback(item));
    return posterFrame;
  }

  const image = document.createElement('img');
  let sourceIndex = 0;
  let triedApiPoster = false;

  image.src = posterSources[sourceIndex] || '';
  image.alt = item.title;
  image.loading = 'lazy';
  image.decoding = 'async';
  image.addEventListener('error', async () => {
    sourceIndex += 1;

    if (posterSources[sourceIndex]) {
      image.src = posterSources[sourceIndex];
      return;
    }

    if (triedApiPoster) {
      posterFrame.replaceChildren(createPosterFallback(item));
      return;
    }

    triedApiPoster = true;
    const apiPoster = await getImdbPoster(item.imdbId);

    if (apiPoster) {
      image.src = apiPoster;
      return;
    }

    posterFrame.replaceChildren(createPosterFallback(item));
  });

  posterFrame.appendChild(image);
  appendMovieTagRibbon(posterFrame, item);
  return posterFrame;
};

const appendMovieTagRibbon = (posterFrame, item) => {
  const normalizedTag = item.tagName.toLowerCase();
  const tagClass =
      normalizedTag === 'worst'
          ? 'worst'
          : normalizedTag === 'high rated'
              ? 'high-rated'
              : normalizedTag === 'entertainment'
                  ? 'entertainment'
                  : '';

  if (!tagClass) return;

  const ribbon = document.createElement('div');
  ribbon.className = `poster-ribbon ${tagClass}`;
  ribbon.textContent = item.tagName;
  posterFrame.appendChild(ribbon);
};

const getImdbPoster = async (imdbId) => {
  const cacheKey = `imdb-poster-${imdbId}`;
  const cachedPoster = getCachedPoster(cacheKey);

  if (cachedPoster) return cachedPoster;

  try {
    const response = await fetch(`https://api.imdbapi.dev/titles/${imdbId}`, {
      headers: {
        accept: 'application/json',
      },
    });

    if (!response.ok) throw new Error(`IMDb API returned ${response.status}`);

    const title = await response.json();
    const posterUrl = title.primaryImage?.url || '';

    if (posterUrl) {
      setCachedPoster(cacheKey, posterUrl);
    }

    return posterUrl;
  } catch (error) {
    console.error(`Could not load poster for ${imdbId}`, error);
    return '';
  }
};

const getCachedPoster = (cacheKey) => {
  try {
    return localStorage.getItem(cacheKey);
  } catch {
    return '';
  }
};

const setCachedPoster = (cacheKey, posterUrl) => {
  try {
    localStorage.setItem(cacheKey, posterUrl);
  } catch {
    // Browsers can disable storage; the app still works without poster caching.
  }
};

const renderTitles = (titles) => {
  gallery.replaceChildren();
  state.visibleTitlesByKey = new Map(titles.map((item) => [item.key, item]));

  if (!titles.length) {
    gallery.innerHTML = '<p class="load-error">No titles match these filters.</p>';
    return;
  }

  const fragment = document.createDocumentFragment();

  titles.forEach((item) => {
    const card = document.createElement('article');
    card.className = 'item';

    const poster = createPoster(item);
    poster.tabIndex = 0;
    poster.setAttribute('role', 'button');
    poster.setAttribute('aria-label', `Open ${item.title} details`);
    poster.dataset.key = item.key;

    card.appendChild(poster);
    card.insertAdjacentHTML(
        'beforeend',
        `
        <div class="title">${escapeHtml(item.title)}</div>
        <div class="year">${escapeHtml(formatYears(item))}</div>
      `
    );

    fragment.appendChild(card);
  });

  gallery.appendChild(fragment);
};

const applyFilters = () => {
  const filterKey = getFilterKey();

  if (filterKey === state.lastFilterKey) return;

  state.lastFilterKey = filterKey;

  const minRating = Number(ratingFilter.value) || 0;
  const searchTerm = searchFilter.value.trim().toLowerCase();
  const activeTitles = state.libraries[state.activeMedia];

  const filteredTitles = activeTitles
      .filter((item) => !searchTerm || item.searchableText.includes(searchTerm))
      .filter((item) => !tagFilter.value || item.tagName === tagFilter.value)
      .filter((item) => !genreFilter.value || item.genres.includes(genreFilter.value))
      .filter((item) => item.rating >= minRating)
      .filter((item) => {
        if (oscarFilter.value === 'wins') return item.oscarWins > 0;
        if (oscarFilter.value === 'nominations') return item.oscarNominations > 0;
        return true;
      })
      .sort((first, second) => second.rating - first.rating);

  filterToggle.classList.toggle('has-active-filters', hasActiveFilters());
  renderTitles(filteredTitles);
};

let filterFrame = 0;

const scheduleApplyFilters = () => {
  cancelAnimationFrame(filterFrame);
  filterFrame = requestAnimationFrame(applyFilters);
};

const populateFilters = () => {
  const titles = state.libraries[state.activeMedia];
  const tags = uniqueSorted(titles.map((item) => item.tagName));
  const genres = uniqueSorted(titles.flatMap((item) => item.genres));

  populateSelect(tagFilter, tags);
  populateSelect(genreFilter, genres);
};

const populateSelect = (select, values) => {
  const selectedValue = select.value;
  select.replaceChildren(new Option('All', ''));

  values.forEach((value) => {
    select.appendChild(new Option(value, value));
  });

  select.value = values.includes(selectedValue) ? selectedValue : '';
};

const uniqueSorted = (values) =>
    [...new Set(values.filter(Boolean))].sort((first, second) => first.localeCompare(second));

const switchMedia = (mediaType) => {
  state.activeMedia = mediaType;

  toggleButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.media === mediaType);
    button.setAttribute('aria-selected', String(button.dataset.media === mediaType));
  });

  populateFilters();
  applyFilters();
};

const clearFilters = () => {
  if (!hasActiveFilters()) return;

  searchFilter.value = '';
  tagFilter.value = '';
  ratingFilter.value = '';
  genreFilter.value = '';
  oscarFilter.value = '';
  applyFilters();
};

const toggleFilters = () => {
  const controls = filterToggle.closest('.library-controls');
  const isOpen = controls.classList.toggle('filters-open');

  filterToggle.setAttribute('aria-expanded', String(isOpen));
  filterToggle.setAttribute('aria-label', isOpen ? 'Hide filters' : 'Show filters');
};

const openModal = (item) => {
  modalBody.replaceChildren();
  modalBody.innerHTML = `
    <div class="modal-poster-area"></div>
    <div class="modal-details">
      <h2 id="modal-title">${escapeHtml(item.title)} (${escapeHtml(formatYears(item))})</h2>
      <p><strong>Type:</strong> ${escapeHtml(mediaConfig[item.mediaType].label)}</p>
      <p><strong>Director:</strong> ${escapeHtml(item.director)}</p>
      <p><strong>Actors:</strong> ${escapeHtml(item.actor)}</p>
      <p><strong>Genre:</strong> ${escapeHtml(item.genre)}</p>
      <p><strong>Runtime:</strong> ${escapeHtml(item.runtime)}</p>
      <p><strong>Rating:</strong> ${escapeHtml(String(item.rating || 'Unknown'))}</p>
      <p><strong>Tag:</strong> ${escapeHtml(item.tagName)}</p>
      <p><strong>Summary:</strong> ${escapeHtml(item.summary)}</p>
      <p><strong>Spoken Languages:</strong> ${escapeHtml(item.spokenLanguages)}</p>
      <p><strong>Country of Origin:</strong> ${escapeHtml(item.countryOfOrigin)}</p>
      <p><strong>Oscar Wins:</strong> ${escapeHtml(String(item.oscarWins))}</p>
      <p><strong>Oscar Nominations:</strong> ${escapeHtml(String(item.oscarNominations))}</p>
      ${item.personalReview ? `<p><strong>My Review:</strong> ${escapeHtml(item.personalReview)}</p>` : ''}
    </div>
  `;

  modalBody.querySelector('.modal-poster-area').appendChild(createPoster(item));
  modal.classList.remove('hidden');
  document.body.classList.add('modal-open');
  closeModalButton.focus();
};

const closeModal = () => {
  modal.classList.add('hidden');
  document.body.classList.remove('modal-open');
};

const formatYears = (item) => {
  if (!item.releaseYear) return 'Unknown year';
  if (item.endYear) return `${item.releaseYear}-${item.endYear}`;
  return String(item.releaseYear);
};

const escapeHtml = (value) =>
    String(value).replace(/[&<>"']/g, (character) => {
      const entities = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
      };
      return entities[character];
    });

const loadLibrary = async () => {
  try {
    const entries = await Promise.all(
        Object.entries(mediaConfig).map(async ([mediaType, config]) => {
          const [listResponse, detailsResponse] = await Promise.all([fetch(config.listUrl), fetch(config.detailsUrl)]);

          if (!listResponse.ok || !detailsResponse.ok) {
            throw new Error(`Could not load ${config.label.toLowerCase()} JSON data.`);
          }

          const [list, details] = await Promise.all([listResponse.json(), detailsResponse.json()]);
          return [mediaType, buildLibrary(list, details, mediaType)];
        })
    );

    entries.forEach(([mediaType, titles]) => {
      state.libraries[mediaType] = titles;
    });

    populateFilters();
    applyFilters();
  } catch (error) {
    gallery.innerHTML = `<p class="load-error">${escapeHtml(error.message)}</p>`;
  }
};

toggleButtons.forEach((button) => {
  button.addEventListener('click', () => switchMedia(button.dataset.media));
});

[searchFilter, tagFilter, ratingFilter, genreFilter, oscarFilter].forEach((filter) => {
  filter.addEventListener('input', scheduleApplyFilters);
});

clearFiltersButton.addEventListener('click', clearFilters);
filterToggle.addEventListener('click', toggleFilters);
closeModalButton.addEventListener('click', closeModal);
gallery.addEventListener('click', (event) => {
  const poster = event.target.closest('.poster-frame');
  if (!poster) return;

  const item = state.visibleTitlesByKey.get(poster.dataset.key);
  if (item) openModal(item);
});
gallery.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;

  const poster = event.target.closest('.poster-frame');
  if (!poster) return;

  const item = state.visibleTitlesByKey.get(poster.dataset.key);
  if (!item) return;

  event.preventDefault();
  openModal(item);
});
modal.addEventListener('click', (event) => {
  if (event.target === modal) closeModal();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeModal();
});

loadLibrary();

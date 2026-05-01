const gallery = document.querySelector('#movie-gallery');
const modal = document.querySelector('#movie-modal');
const modalBody = document.querySelector('#modal-body');
const closeModalButton = document.querySelector('#close-modal');
const toggleButtons = document.querySelectorAll('.toggle-button');
const tagFilter = document.querySelector('#tag-filter');
const ratingFilter = document.querySelector('#rating-filter');
const genreFilter = document.querySelector('#genre-filter');
const oscarFilter = document.querySelector('#oscar-filter');
const clearFiltersButton = document.querySelector('#clear-filters');

const state = {
  activeMedia: 'movies',
  libraries: {
    movies: [],
    tv: [],
  },
};

const mediaConfig = {
  movies: {
    detailsUrl: './data/movies_details.json',
    posterDir: 'MoviesPoster',
    label: 'Movie',
  },
  tv: {
    detailsUrl: './data/tv_show_details.json',
    posterDir: 'TvShowsPoster',
    label: 'TV Show',
  },
};

const normalizeTitle = (item, mediaType) => ({
  id: item.id,
  imdbId: item.movie_id,
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
  tagName: item.tagname || 'Untagged',
  type: item.type || mediaConfig[mediaType].label,
});

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

  if (!item.imdbId) {
    posterFrame.appendChild(createPosterFallback(item));
    return posterFrame;
  }

  const image = document.createElement('img');
  let triedApiPoster = false;

  image.src = `./${mediaConfig[item.mediaType].posterDir}/${item.imdbId}.jpg`;
  image.alt = item.title;
  image.loading = 'lazy';
  image.addEventListener('error', async () => {
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
  const cachedPoster = localStorage.getItem(cacheKey);

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
      localStorage.setItem(cacheKey, posterUrl);
    }

    return posterUrl;
  } catch (error) {
    console.error(`Could not load poster for ${imdbId}`, error);
    return '';
  }
};

const renderTitles = (titles) => {
  gallery.replaceChildren();

  if (!titles.length) {
    gallery.innerHTML = '<p class="load-error">No titles match these filters.</p>';
    return;
  }

  titles.forEach((item) => {
    const card = document.createElement('article');
    card.className = 'item';

    const poster = createPoster(item);
    poster.tabIndex = 0;
    poster.setAttribute('role', 'button');
    poster.setAttribute('aria-label', `Open ${item.title} details`);

    card.appendChild(poster);
    card.insertAdjacentHTML(
        'beforeend',
        `
        <div class="title">${escapeHtml(item.title)}</div>
        <div class="year">${escapeHtml(formatYears(item))}</div>
      `
    );

    poster.addEventListener('click', () => openModal(item));
    poster.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openModal(item);
      }
    });

    gallery.appendChild(card);
  });
};

const applyFilters = () => {
  const minRating = Number(ratingFilter.value) || 0;
  const activeTitles = state.libraries[state.activeMedia];

  const filteredTitles = activeTitles
      .filter((item) => !tagFilter.value || item.tagName === tagFilter.value)
      .filter((item) => !genreFilter.value || item.genres.includes(genreFilter.value))
      .filter((item) => item.rating >= minRating)
      .filter((item) => {
        if (oscarFilter.value === 'wins') return item.oscarWins > 0;
        if (oscarFilter.value === 'nominations') return item.oscarNominations > 0;
        return true;
      })
      .sort((first, second) => second.rating - first.rating);

  renderTitles(filteredTitles);
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
  });

  populateFilters();
  applyFilters();
};

const clearFilters = () => {
  tagFilter.value = '';
  ratingFilter.value = '';
  genreFilter.value = '';
  oscarFilter.value = '';
  applyFilters();
};

const openModal = (item) => {
  modalBody.replaceChildren();
  modalBody.innerHTML = `
    <div class="modal-poster-area"></div>
    <div class="modal-details">
      <h2>${escapeHtml(item.title)} (${escapeHtml(formatYears(item))})</h2>
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
    </div>
  `;

  modalBody.querySelector('.modal-poster-area').appendChild(createPoster(item));
  modal.classList.remove('hidden');
  document.body.classList.add('modal-open');
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
          const response = await fetch(config.detailsUrl);

          if (!response.ok) {
            throw new Error(`Could not load ${config.label.toLowerCase()} JSON data.`);
          }

          const data = await response.json();
          return [mediaType, data.map((item) => normalizeTitle(item, mediaType))];
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

[tagFilter, ratingFilter, genreFilter, oscarFilter].forEach((filter) => {
  filter.addEventListener('input', applyFilters);
});

clearFiltersButton.addEventListener('click', clearFilters);
closeModalButton.addEventListener('click', closeModal);
modal.addEventListener('click', (event) => {
  if (event.target === modal) closeModal();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeModal();
});

loadLibrary();

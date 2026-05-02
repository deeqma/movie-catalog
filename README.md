# Movie Catalog

A personal, static movie and TV catalog for remembering what I have watched,
putting them into Tags (Entertainment, Worst and High Rated),

![img.png](UI.png)


## Tags

Current tags

* **High Rated**: Means over all amazing, great acting, a well-crafted story, and excellent execution.
* **Entertainment**: Somewhere in between, not High rated or Worst, just purely entertaining.
* **Worst**: Extremely bad, poor acting, terrible storytelling, and awful, AWFUL execution. It’s so bad it’s mind blowing.



## Add a Movie

Add only the title and release year to `data/movies.json`:

```json
{
  "poster_image_path": "",
  "release_year": 2014,
  "title_name": "Night at the Museum: Secret of the Tomb"
}
```

Then run:

```bash
npm run enrich:movies
```


## Run Locally

Because the browser blocks some JSON loading when opening `index.html` directly, run a small local server:

#### Ruqiered
* Nodejs installed
* `ffmpeg` installed for poster JPG/WebP generation



```bash
npm start
```

Then open:

```text
http://localhost:8000
```
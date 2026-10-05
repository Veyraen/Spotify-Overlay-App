const { parseLrc } = require("./lrc-parser");

const LRCLIB_SEARCH_URL = "https://lrclib.net/api/search";
const USER_AGENT = "Supra/2.0.0";

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function scoreCandidate(candidate, track) {
  let score = 0;

  const candidateTrack = normalizeText(candidate.trackName);

  const candidateArtist = normalizeText(candidate.artistName);

  const candidateAlbum = normalizeText(candidate.albumName);

  const trackName = normalizeText(track.name);

  const artistName = normalizeText(track.artists?.[0]);

  const albumName = normalizeText(track.album);

  if (candidateTrack === trackName) score += 5;
  if (candidateArtist === artistName) score += 4;
  if (candidateAlbum === albumName) score += 2;
  if (candidate.syncedLyrics) score += 3;

  const durationSeconds = Math.round((track.durationMs || 0) / 1000);

  if (durationSeconds && candidate.duration) {
    const durationDelta = Math.abs(candidate.duration - durationSeconds);

    if (durationDelta <= 2) score += 3;
    else if (durationDelta <= 5) score += 1;
  }

  return score;
}

class LrclibApi {
  async findSyncedLyrics(track) {
    if (!track?.name || !track.artists?.length) {
      return null;
    }

    const searchParams = new URLSearchParams({
      track_name: track.name,
      artist_name: track.artists[0],
    });

    if (track.album) {
      searchParams.set("album_name", track.album);
    }

    if (track.durationMs) {
      searchParams.set("duration", String(Math.round(track.durationMs / 1000)));
    }

    const response = await fetch(`${LRCLIB_SEARCH_URL}?${searchParams}`, {
      headers: {
        "User-Agent": USER_AGENT,
      },
    });

    if (!response.ok) {
      throw new Error(`LRCLIB search failed: ${response.status}`);
    }

    const candidates = await response.json();

    if (!Array.isArray(candidates) || candidates.length === 0) {
      return null;
    }

    const bestCandidate = candidates
      .filter((candidate) => candidate.syncedLyrics)
      .sort(
        (firstCandidate, secondCandidate) =>
          scoreCandidate(secondCandidate, track) -
          scoreCandidate(firstCandidate, track),
      )[0];

    if (!bestCandidate) {
      return null;
    }

    const lines = parseLrc(bestCandidate.syncedLyrics);

    if (lines.length === 0) {
      return null;
    }

    return {
      source: "lrclib",
      id: bestCandidate.id,
      trackName: bestCandidate.trackName,
      artistName: bestCandidate.artistName,
      albumName: bestCandidate.albumName,
      duration: bestCandidate.duration,
      lines,
    };
  }
}

module.exports = LrclibApi;

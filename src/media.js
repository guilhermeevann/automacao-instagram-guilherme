async function buscarMediaRecente(accessToken, igUserId, limit = 25) {
  const url =
    `https://graph.instagram.com/v25.0/${igUserId}/media` +
    `?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp` +
    `&limit=${limit}&access_token=${encodeURIComponent(accessToken)}`;

  const resp = await fetch(url);
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data?.error?.message || "Falha ao buscar posts no Instagram");
  }

  return (data.data || []).map((item) => ({
    id: item.id,
    caption_snippet: (item.caption || "").slice(0, 80),
    permalink: item.permalink,
    timestamp: item.timestamp,
    thumbnail:
      item.media_type === "VIDEO" ? item.thumbnail_url : item.media_url,
  }));
}

module.exports = { buscarMediaRecente };

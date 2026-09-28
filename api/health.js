export default async function handler(_req, res) {
  res.status(200).json({
    ok: true,
    controller: "physics-intern-hobby",
    sandbox: {
      planTarget: "Hobby",
      vcpus: 2,
      memoryGiB: 4,
      sessionMinutes: 40,
      persistent: true
    },
    autoresearch: false
  });
}

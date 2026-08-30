const ffmpeg = require('fluent-ffmpeg');
const ffprobeStatic = require('ffprobe-static');
ffmpeg.setFfprobePath(ffprobeStatic.path);

ffmpeg.ffprobe('https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', (err, data) => {
  console.log(JSON.stringify(data, null, 2));
});

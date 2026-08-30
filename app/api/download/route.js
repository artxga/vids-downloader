import { NextResponse } from 'next/server';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import fs from 'fs';
import path from 'path';

ffmpeg.setFfmpegPath(ffmpegStatic);

// We must export config to allow streaming response if needed, 
// but in Next.js App Router, returning a stream is supported by default.

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 });
  }

  const downloadsDir = path.join(process.cwd(), 'public', 'downloads');
  if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
  } else {
    // Limpieza de archivos antiguos (mayores a 1 hora) para asegurar que no quede basura
    try {
      const files = fs.readdirSync(downloadsDir);
      const now = Date.now();
      files.forEach(file => {
        if (file.endsWith('.mp4')) {
          const fp = path.join(downloadsDir, file);
          const stats = fs.statSync(fp);
          if (now - stats.mtimeMs > 3600000) {
            fs.unlinkSync(fp);
          }
        }
      });
    } catch (e) {
      console.error('Error limpiando descargas antiguas:', e);
    }
  }

  const filename = `video_${Date.now()}.mp4`;
  const outputPath = path.join(downloadsDir, filename);

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let durationInSeconds = 0;

      const command = ffmpeg(url)
        // Usually m3u8 uses aac and h264, so we can just copy streams,
        // but to ensure compatibility we can use '-c copy' and '-bsf:a aac_adtstoasc'
        .outputOptions([
          '-c copy',
          '-bsf:a aac_adtstoasc'
        ])
        .output(outputPath)
        .on('start', (commandLine) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: 'start', message: 'Descarga iniciada' })}\n\n`));
        })
        .on('codecData', (data) => {
          // data.duration format is 'HH:MM:SS.xx'
          if (data.duration) {
            const timeArr = data.duration.split(':');
            if (timeArr.length === 3) {
              durationInSeconds = (parseFloat(timeArr[0]) * 3600) + (parseFloat(timeArr[1]) * 60) + parseFloat(timeArr[2]);
            }
          }
        })
        .on('progress', (progress) => {
          // progress.percent is sometimes provided by fluent-ffmpeg, 
          // but for m3u8 it might be undefined. Let's calculate if not present.
          let percent = progress.percent;
          if (percent === undefined && progress.timemark && durationInSeconds > 0) {
            const timeArr = progress.timemark.split(':');
            if (timeArr.length === 3) {
              const currentSeconds = (parseFloat(timeArr[0]) * 3600) + (parseFloat(timeArr[1]) * 60) + parseFloat(timeArr[2]);
              percent = (currentSeconds / durationInSeconds) * 100;
            }
          }
          
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            status: 'progress', 
            percent: percent ? Math.min(100, Math.round(percent * 10) / 10) : 0, 
            timemark: progress.timemark || '00:00:00.00' 
          })}\n\n`));
        })
        .on('end', () => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: 'done', filename, url: `/api/getFile?filename=${filename}` })}\n\n`));
          controller.close();
        })
        .on('error', (err) => {
          console.error('FFMPEG Error:', err);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: 'error', message: err.message })}\n\n`));
          controller.close();
        });

      command.run();

      request.signal.addEventListener('abort', () => {
        command.kill('SIGKILL');
        // Clean up the partial file
        if (fs.existsSync(outputPath)) {
          fs.unlinkSync(outputPath);
        }
        controller.close();
      });
    }
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}

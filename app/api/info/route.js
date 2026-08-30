import { NextResponse } from 'next/server';
import ffmpeg from 'fluent-ffmpeg';
import ffprobeStatic from 'ffprobe-static';

ffmpeg.setFfprobePath(ffprobeStatic.path);

export async function POST(request) {
  try {
    const { url } = await request.json();
    
    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    const metadata = await new Promise((resolve, reject) => {
      ffmpeg.ffprobe(url, (err, metadata) => {
        if (err) reject(err);
        else resolve(metadata);
      });
    });

    const videoStreams = metadata.streams.filter(s => s.codec_type === 'video');
    let bestStream = videoStreams[0];
    if (videoStreams.length > 1) {
      bestStream = videoStreams.reduce((prev, current) => {
        const prevRes = (prev.width || 0) * (prev.height || 0);
        const currentRes = (current.width || 0) * (current.height || 0);
        return (currentRes > prevRes) ? current : prev;
      });
    }
    
    const format = metadata.format;
    
    let durationFormatted = 'Desconocida';
    let durationSeconds = 0;
    if (format && format.duration) {
      durationSeconds = parseFloat(format.duration);
      const minutes = Math.floor(durationSeconds / 60);
      const seconds = Math.floor(durationSeconds % 60);
      durationFormatted = `${minutes}m ${seconds}s`;
    }

    let estimatedSize = 'Desconocido';
    let bitrate = 'Desconocido';
    
    let bitRateVal = 0;
    if (bestStream && bestStream.tags && bestStream.tags.variant_bitrate) {
      bitRateVal = parseFloat(bestStream.tags.variant_bitrate);
    } else if (format && format.bit_rate && parseFloat(format.bit_rate) > 1000) {
      bitRateVal = parseFloat(format.bit_rate);
    }
    
    if (bitRateVal > 0) {
      bitrate = `${Math.round(bitRateVal / 1000)} kbps`;
      
      if (durationSeconds > 0) {
        // Size in bytes = (bitrate * duration) / 8
        const sizeBytes = (bitRateVal * durationSeconds) / 8;
        if (sizeBytes > 1024 * 1024 * 1024) {
          estimatedSize = `${(sizeBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
        } else if (sizeBytes > 1024 * 1024) {
          estimatedSize = `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`;
        } else {
          estimatedSize = `${(sizeBytes / 1024).toFixed(2)} KB`;
        }
      }
    }

    return NextResponse.json({
      resolution: bestStream ? `${bestStream.width}x${bestStream.height}` : 'Desconocida',
      duration: durationFormatted,
      formatName: format ? format.format_name : 'Desconocido',
      bitrate: bitrate,
      estimatedSize: estimatedSize
    });
  } catch (error) {
    console.error('Error fetching info:', error);
    return NextResponse.json({ error: 'Failed to fetch video information' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const filename = searchParams.get('filename');

  if (!filename) {
    return NextResponse.json({ error: 'Filename is required' }, { status: 400 });
  }

  // We are assuming the file was placed here temporarily
  const filePath = path.join(process.cwd(), 'public', 'downloads', filename);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  const stats = fs.statSync(filePath);

  const stream = new ReadableStream({
    start(controller) {
      const fileStream = fs.createReadStream(filePath);
      
      fileStream.on('data', (chunk) => {
        controller.enqueue(chunk);
      });
      
      fileStream.on('end', () => {
        controller.close();
        // Delete the file after it's successfully streamed to the browser
        fs.unlink(filePath, (err) => {
          if (err) console.error('Failed to delete file:', err);
        });
      });
      
      fileStream.on('error', (err) => {
        controller.error(err);
        fs.unlink(filePath, (e) => {});
      });

      request.signal.addEventListener('abort', () => {
        fileStream.destroy();
        // Even if aborted, clean up the file
        fs.unlink(filePath, (err) => {});
      });
    }
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Type': 'video/mp4',
      'Content-Length': stats.size.toString(),
    },
  });
}

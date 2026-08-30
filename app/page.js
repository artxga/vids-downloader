'use client';

import { useState } from 'react';
import './globals.css';

export default function Home() {
  const [url, setUrl] = useState('');
  const [info, setInfo] = useState(null);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [error, setError] = useState('');
  
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadStatus, setDownloadStatus] = useState('');
  const [finalUrl, setFinalUrl] = useState('');

  const fetchInfo = async () => {
    if (!url) {
      setError('Por favor, ingresa una URL válida.');
      return;
    }
    setError('');
    setInfo(null);
    setLoadingInfo(true);
    setProgress(0);
    setFinalUrl('');
    setDownloadStatus('');

    try {
      const res = await fetch('/api/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Error al obtener la información.');
      }

      setInfo(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingInfo(false);
    }
  };

  const startDownload = () => {
    if (!url) return;
    setDownloading(true);
    setProgress(0);
    setDownloadStatus('Iniciando...');
    setError('');
    setFinalUrl('');

    const eventSource = new EventSource(`/api/download?url=${encodeURIComponent(url)}`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.status === 'start') {
          setDownloadStatus('Descargando...');
        } else if (data.status === 'progress') {
          setProgress(data.percent);
          setDownloadStatus(`Descargando... (Tiempo act: ${data.timemark})`);
        } else if (data.status === 'done') {
          setDownloadStatus('¡Completado!');
          setProgress(100);
          setFinalUrl(data.url);
          setDownloading(false);
          eventSource.close();
        } else if (data.status === 'error') {
          setError(`Error: ${data.message}`);
          setDownloading(false);
          eventSource.close();
        }
      } catch (e) {
        console.error('Error parsing SSE data', e);
      }
    };

    eventSource.onerror = (err) => {
      console.error('EventSource error:', err);
      setError('Se perdió la conexión con el servidor.');
      setDownloading(false);
      eventSource.close();
    };
  };

  return (
    <div className="container">
      <div className="glass-panel">
        <div className="header">
          <h1>m3u8 Downloader</h1>
          <p>Extrae y descarga streams m3u8 con calidad original</p>
        </div>

        {error && <div className="error-message">{error}</div>}

        <div className="input-group">
          <input
            type="url"
            className="input-field"
            placeholder="Pega tu URL .m3u8 aquí..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={loadingInfo || downloading}
          />
          <button 
            className="btn btn-primary" 
            onClick={fetchInfo}
            disabled={loadingInfo || downloading || !url}
          >
            {loadingInfo ? <div className="spinner"></div> : 'Analizar URL'}
          </button>
        </div>

        {info && (
          <div className="info-panel">
            <div className="info-grid">
              <div className="info-item">
                <span className="info-label">Resolución</span>
                <span className="info-value">{info.resolution}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Duración</span>
                <span className="info-value">{info.duration}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Formato</span>
                <span className="info-value">{info.formatName}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Bitrate</span>
                <span className="info-value">{info.bitrate}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Peso Estimado</span>
                <span className="info-value">{info.estimatedSize || 'Desconocido'}</span>
              </div>
            </div>
            
            {!downloading && !finalUrl && (
              <button 
                className="btn btn-primary" 
                style={{ width: '100%', marginTop: '1.5rem', background: '#10b981' }}
                onClick={startDownload}
              >
                Descargar Video
              </button>
            )}
          </div>
        )}

        {(downloading || progress > 0) && (
          <div className="progress-container">
            <div className="progress-bar-bg">
              <div 
                className="progress-bar-fill" 
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <div className="progress-stats">
              <span>{downloadStatus}</span>
              <span>{progress.toFixed(1)}%</span>
            </div>
          </div>
        )}

        {finalUrl && (
          <a href={finalUrl} download className="btn btn-success" target="_blank" rel="noreferrer">
            Guardar / Abrir Archivo
          </a>
        )}
      </div>
    </div>
  );
}

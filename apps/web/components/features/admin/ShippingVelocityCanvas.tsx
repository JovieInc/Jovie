'use client';

import {
  CategoryScale,
  Chart,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import { useEffect, useRef } from 'react';
import type { DailyBucket } from './ShippingVelocityChart';

Chart.register(
  CategoryScale,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
  Legend
);

export function shippingChartData(
  data: DailyBucket[],
  colors: string[],
  showClosed: boolean
) {
  return {
    labels: data.map(row => row.date),
    datasets: [
      {
        label: 'Merged Pull Requests',
        data: data.map(row => row.merged),
        borderColor: colors[0],
        borderDash: [],
      },
      {
        label: 'Opened Pull Requests',
        data: data.map(row => row.opened),
        borderColor: colors[1],
        borderDash: [5, 3],
      },
      {
        label: 'Closed Without Merge',
        data: data.map(row => row.closed),
        borderColor: colors[2],
        borderDash: [2, 3],
        hidden: !showClosed,
      },
    ],
  };
}

export function ShippingVelocityCanvas({
  data,
  spotlight,
  showClosed,
  onLineClick,
  onChartClick,
}: Readonly<{
  data: DailyBucket[];
  spotlight: string | null;
  showClosed: boolean;
  onLineClick: (series: string) => void;
  onChartClick: () => void;
}>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let chart: Chart<'line'> | undefined;
    // Canvas cannot interpret CSS variables. Resolve the shared tokens through
    // CSS so nested var(), OKLCH, and light/dark theme changes stay canonical.
    const probe = document.createElement('span');
    canvas.parentElement?.append(probe);
    function color(token: string) {
      probe.style.color = `var(${token})`;
      return getComputedStyle(probe).color;
    }
    const draw = () => {
      chart?.destroy();
      const colors = [
        '--color-accent-blue',
        '--color-accent-purple',
        '--color-accent-gray',
      ].map(color);
      const foreground = color('--color-text-secondary-token');
      const fontFamily = getComputedStyle(canvas).fontFamily;
      const chartData = shippingChartData(data, colors, showClosed);
      chartData.datasets.forEach((series, index) => {
        Object.assign(series, {
          borderWidth:
            !spotlight || ['merged', 'opened', 'closed'][index] === spotlight
              ? 2
              : 1,
          pointRadius: 0,
        });
      });
      chart = new Chart(canvas, {
        type: 'line',
        data: chartData,
        options: {
          font: { family: fontFamily },
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          interaction: { mode: 'index', intersect: false },
          onClick: (_event, elements) => {
            const element = elements[0];
            if (!element) {
              onChartClick();
              return;
            }
            const series = ['merged', 'opened', 'closed'][element.datasetIndex];
            if (series) onLineClick(series);
          },
          plugins: { legend: { display: false } },
          scales: {
            x: {
              ticks: { color: foreground, maxTicksLimit: 6, maxRotation: 0 },
              grid: { display: false },
              title: { display: true, text: 'Date (UTC)', color: foreground },
            },
            y: {
              beginAtZero: true,
              ticks: { color: foreground, precision: 0 },
              grid: { color: color('--color-border-subtle') },
              title: {
                display: true,
                text: 'Pull Requests / Day',
                color: foreground,
              },
            },
          },
        },
      });
    };
    draw();
    const observer = new MutationObserver(draw);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme', 'style'],
    });
    return () => {
      observer.disconnect();
      chart?.destroy();
      probe.remove();
    };
  }, [data, onChartClick, onLineClick, spotlight, showClosed]);
  return (
    <>
      <div className='relative h-50 w-full'>
        <canvas
          ref={canvasRef}
          role='img'
          aria-label='Daily GitHub Pull Request Counts. Full Data Follows.'
        />
      </div>
      <details className='mt-3 text-xs text-secondary-token'>
        <summary className='cursor-pointer'>
          View daily data and lead time
        </summary>
        <div className='max-h-64 overflow-auto'>
          <table className='w-full text-left tabular-nums'>
            <caption className='text-left'>
              GitHub · UTC days · Lead time is daily median PR creation to
              merge, in hours.
            </caption>
            <thead>
              <tr>
                {[
                  'Date (UTC)',
                  'Merged Pull Requests',
                  'Opened Pull Requests',
                  'Closed Without Merge',
                  'Median hours to merge',
                ].map(label => (
                  <th key={label} scope='col' className='p-2 whitespace-nowrap'>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map(row => (
                <tr key={row.date}>
                  <th scope='row' className='p-2 whitespace-nowrap'>
                    {row.date}
                  </th>
                  <td className='p-2'>{row.merged}</td>
                  <td className='p-2'>{row.opened}</td>
                  <td className='p-2'>{row.closed}</td>
                  <td className='p-2'>
                    {row.mergeP50Hours == null
                      ? 'UNKNOWN'
                      : row.mergeP50Hours.toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}

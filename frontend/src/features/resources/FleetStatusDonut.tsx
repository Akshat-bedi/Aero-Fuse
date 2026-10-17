import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { Aircraft } from '@/types';

interface FleetStatusDonutProps {
  aircraft: Aircraft[];
  className?: string;
}

export const FleetStatusDonut: React.FC<FleetStatusDonutProps> = ({
  aircraft,
  className = '',
}) => {
  const counts = useMemo(() => {
    const summary = {
      serviceable: 0,
      airborne: 0,
      maintenance: 0,
      unserviceable: 0,
      turnaround: 0,
    };

    aircraft.forEach((a) => {
      if (summary[a.status] !== undefined) {
        summary[a.status]++;
      }
    });

    return summary;
  }, [aircraft]);

  const option = useMemo(() => {
    const data = [
      { value: counts.serviceable, name: 'Serviceable', itemStyle: { color: '#10b981' } },
      { value: counts.airborne, name: 'Airborne Sortie', itemStyle: { color: '#06b6d4' } },
      { value: counts.turnaround, name: 'Turnaround', itemStyle: { color: '#8b5cf6' } },
      { value: counts.maintenance, name: 'Scheduled Maint', itemStyle: { color: '#f59e0b' } },
      { value: counts.unserviceable, name: 'Unserviceable (AOG)', itemStyle: { color: '#ef4444' } },
    ].filter((d) => d.value > 0);

    return {
      backgroundColor: 'transparent',
      title: {
        text: 'FLEET POSTURE',
        left: 'center',
        top: '42%',
        textStyle: {
          color: '#94a3b8',
          fontSize: 10,
          fontFamily: 'monospace',
          fontWeight: 'normal',
        },
        subtext: `${aircraft.length} HULLS`,
        subtextStyle: {
          color: '#f8fafc',
          fontSize: 16,
          fontWeight: 'bold',
          fontFamily: 'monospace',
        },
      },
      tooltip: {
        trigger: 'item',
        backgroundColor: '#0f172a',
        borderColor: '#334155',
        borderWidth: 1,
        textStyle: {
          color: '#f8fafc',
          fontFamily: 'monospace',
          fontSize: 11,
        },
        formatter: '{b}: <b>{c}</b> ({d}%)',
      },
      legend: {
        bottom: '0%',
        left: 'center',
        itemWidth: 10,
        itemHeight: 10,
        icon: 'circle',
        textStyle: {
          color: '#94a3b8',
          fontFamily: 'monospace',
          fontSize: 10,
        },
      },
      series: [
        {
          name: 'Fleet Status',
          type: 'pie',
          radius: ['52%', '72%'],
          center: ['50%', '48%'],
          avoidLabelOverlap: false,
          label: {
            show: false,
          },
          emphasis: {
            scale: true,
            scaleSize: 6,
            label: {
              show: false,
            },
          },
          data,
        },
      ],
    };
  }, [aircraft.length, counts]);

  return (
    <div
      data-testid="fleet-status-donut"
      className={`relative w-full h-56 flex flex-col items-center justify-center ${className}`}
    >
      <ReactECharts
        option={option}
        style={{ height: '100%', width: '100%' }}
        opts={{ renderer: 'canvas' }}
      />
    </div>
  );
};

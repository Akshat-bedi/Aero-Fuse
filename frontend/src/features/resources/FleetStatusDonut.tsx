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
      { value: counts.serviceable, name: 'Serviceable', itemStyle: { color: '#48a972', borderColor: '#141917', borderWidth: 1.5 } },
      { value: counts.airborne, name: 'Airborne Sortie', itemStyle: { color: '#5b8ec2', borderColor: '#141917', borderWidth: 1.5 } },
      { value: counts.turnaround, name: 'Turnaround', itemStyle: { color: '#78909c', borderColor: '#141917', borderWidth: 1.5 } },
      { value: counts.maintenance, name: 'Scheduled Maint', itemStyle: { color: '#d9a521', borderColor: '#141917', borderWidth: 1.5 } },
      { value: counts.unserviceable, name: 'Unserviceable (AOG)', itemStyle: { color: '#c93b3b', borderColor: '#141917', borderWidth: 1.5 } },
    ].filter((d) => d.value > 0);

    return {
      backgroundColor: 'transparent',
      title: {
        text: 'FLEET POSTURE',
        left: 'center',
        top: '42%',
        textStyle: {
          color: '#879a8e',
          fontSize: 10,
          fontFamily: 'monospace',
          fontWeight: 'normal',
        },
        subtext: `${aircraft.length} HULLS`,
        subtextStyle: {
          color: '#e6ede8',
          fontSize: 16,
          fontWeight: 'bold',
          fontFamily: 'monospace',
        },
      },
      tooltip: {
        trigger: 'item',
        backgroundColor: '#141917',
        borderColor: '#26332c',
        borderWidth: 1,
        textStyle: {
          color: '#e6ede8',
          fontFamily: 'monospace',
          fontSize: 11,
        },
        formatter: '{b}: <b>{c}</b> ({d}%)',
      },
      legend: {
        bottom: '0%',
        left: 'center',
        itemWidth: 8,
        itemHeight: 8,
        icon: 'rect',
        textStyle: {
          color: '#879a8e',
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
            scaleSize: 4,
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

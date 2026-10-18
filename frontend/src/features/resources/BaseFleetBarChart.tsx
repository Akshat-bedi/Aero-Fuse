import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { Aircraft, Base } from '@/types';

interface BaseFleetBarChartProps {
  aircraft: Aircraft[];
  bases: Record<string, Base>;
  className?: string;
}

export const BaseFleetBarChart: React.FC<BaseFleetBarChartProps> = ({
  aircraft,
  bases,
  className = '',
}) => {
  const baseIds = Object.keys(bases);

  const chartData = useMemo(() => {
    const baseNames = baseIds.map((id) => bases[id]?.name ? `${id} (${bases[id].name.split(' ')[0]})` : id);

    const serviceable: number[] = [];
    const airborne: number[] = [];
    const turnaround: number[] = [];
    const maintenance: number[] = [];
    const unserviceable: number[] = [];

    baseIds.forEach((bId) => {
      const baseAc = aircraft.filter((a) => a.baseId === bId);
      serviceable.push(baseAc.filter((a) => a.status === 'serviceable').length);
      airborne.push(baseAc.filter((a) => a.status === 'airborne').length);
      turnaround.push(baseAc.filter((a) => a.status === 'turnaround').length);
      maintenance.push(baseAc.filter((a) => a.status === 'maintenance').length);
      unserviceable.push(baseAc.filter((a) => a.status === 'unserviceable').length);
    });

    return {
      baseNames,
      serviceable,
      airborne,
      turnaround,
      maintenance,
      unserviceable,
    };
  }, [aircraft, bases, baseIds]);

  const option = useMemo(() => {
    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow',
        },
        backgroundColor: '#141917',
        borderColor: '#26332c',
        borderWidth: 1,
        textStyle: {
          color: '#e6ede8',
          fontFamily: 'monospace',
          fontSize: 11,
        },
      },
      legend: {
        top: '2%',
        right: '4%',
        itemWidth: 8,
        itemHeight: 8,
        icon: 'rect',
        textStyle: {
          color: '#879a8e',
          fontFamily: 'monospace',
          fontSize: 10,
        },
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '8%',
        top: '18%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: chartData.baseNames,
        axisLine: {
          lineStyle: { color: '#26332c' },
        },
        axisLabel: {
          color: '#879a8e',
          fontFamily: 'monospace',
          fontSize: 10,
        },
      },
      yAxis: {
        type: 'value',
        splitLine: {
          lineStyle: {
            color: '#1a231e',
            type: 'dashed',
          },
        },
        axisLabel: {
          color: '#879a8e',
          fontFamily: 'monospace',
          fontSize: 10,
        },
      },
      series: [
        {
          name: 'Serviceable',
          type: 'bar',
          stack: 'total',
          itemStyle: { color: '#48a972' },
          data: chartData.serviceable,
        },
        {
          name: 'Airborne',
          type: 'bar',
          stack: 'total',
          itemStyle: { color: '#5b8ec2' },
          data: chartData.airborne,
        },
        {
          name: 'Turnaround',
          type: 'bar',
          stack: 'total',
          itemStyle: { color: '#78909c' },
          data: chartData.turnaround,
        },
        {
          name: 'Maintenance',
          type: 'bar',
          stack: 'total',
          itemStyle: { color: '#d9a521' },
          data: chartData.maintenance,
        },
        {
          name: 'Unserviceable',
          type: 'bar',
          stack: 'total',
          itemStyle: { color: '#c93b3b' },
          data: chartData.unserviceable,
        },
      ],
    };
  }, [chartData]);

  return (
    <div
      data-testid="base-fleet-bar-chart"
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

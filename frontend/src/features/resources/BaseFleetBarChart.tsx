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
        backgroundColor: '#0f172a',
        borderColor: '#334155',
        borderWidth: 1,
        textStyle: {
          color: '#f8fafc',
          fontFamily: 'monospace',
          fontSize: 11,
        },
      },
      legend: {
        top: '2%',
        right: '4%',
        itemWidth: 10,
        itemHeight: 10,
        icon: 'rect',
        textStyle: {
          color: '#94a3b8',
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
          lineStyle: { color: '#334155' },
        },
        axisLabel: {
          color: '#94a3b8',
          fontFamily: 'monospace',
          fontSize: 10,
        },
      },
      yAxis: {
        type: 'value',
        splitLine: {
          lineStyle: {
            color: '#1e293b',
            type: 'dashed',
          },
        },
        axisLabel: {
          color: '#64748b',
          fontFamily: 'monospace',
          fontSize: 10,
        },
      },
      series: [
        {
          name: 'Serviceable',
          type: 'bar',
          stack: 'total',
          itemStyle: { color: '#10b981' },
          data: chartData.serviceable,
        },
        {
          name: 'Airborne',
          type: 'bar',
          stack: 'total',
          itemStyle: { color: '#06b6d4' },
          data: chartData.airborne,
        },
        {
          name: 'Turnaround',
          type: 'bar',
          stack: 'total',
          itemStyle: { color: '#8b5cf6' },
          data: chartData.turnaround,
        },
        {
          name: 'Maintenance',
          type: 'bar',
          stack: 'total',
          itemStyle: { color: '#f59e0b' },
          data: chartData.maintenance,
        },
        {
          name: 'Unserviceable',
          type: 'bar',
          stack: 'total',
          itemStyle: { color: '#ef4444' },
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

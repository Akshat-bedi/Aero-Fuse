import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { Crew, Base } from '@/types';

interface CrewFatigueChartProps {
  crew: Crew[];
  bases: Record<string, Base>;
  className?: string;
}

export const CrewFatigueChart: React.FC<CrewFatigueChartProps> = ({
  crew,
  bases,
  className = '',
}) => {
  const baseIds = Object.keys(bases);

  const metrics = useMemo(() => {
    const categories = baseIds.map((id) => (bases[id]?.name ? `${id} (${bases[id].name.split(' ')[0]})` : id));
    const avgFatigue: number[] = [];
    const peakDuty: number[] = [];
    const nearLimitCount: number[] = [];

    baseIds.forEach((bId) => {
      const baseCrew = crew.filter((c) => c.baseId === bId);
      if (baseCrew.length === 0) {
        avgFatigue.push(0);
        peakDuty.push(0);
        nearLimitCount.push(0);
        return;
      }

      const totalFatigue = baseCrew.reduce((acc, c) => acc + c.fatigueIndex, 0);
      avgFatigue.push(Math.round(totalFatigue / baseCrew.length));

      const maxDuty = Math.max(...baseCrew.map((c) => c.dutyHoursLast24h));
      peakDuty.push(+maxDuty.toFixed(1));

      const alertCount = baseCrew.filter(
        (c) => c.dutyHoursLast24h >= 10 || c.fatigueIndex >= 75,
      ).length;
      nearLimitCount.push(alertCount);
    });

    return { categories, avgFatigue, peakDuty, nearLimitCount };
  }, [crew, bases, baseIds]);

  const option = useMemo(() => {
    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'cross',
          crossStyle: {
            color: '#879a8e',
          },
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
        data: metrics.categories,
        axisLine: {
          lineStyle: { color: '#26332c' },
        },
        axisLabel: {
          color: '#879a8e',
          fontFamily: 'monospace',
          fontSize: 10,
        },
      },
      yAxis: [
        {
          type: 'value',
          name: 'Fatigue (0-100)',
          min: 0,
          max: 100,
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
          nameTextStyle: {
            color: '#879a8e',
            fontFamily: 'monospace',
            fontSize: 9,
          },
        },
        {
          type: 'value',
          name: 'Peak Duty (Hours)',
          min: 0,
          max: 16,
          splitLine: { show: false },
          axisLabel: {
            color: '#879a8e',
            fontFamily: 'monospace',
            fontSize: 10,
            formatter: '{value}h',
          },
          nameTextStyle: {
            color: '#879a8e',
            fontFamily: 'monospace',
            fontSize: 9,
          },
        },
      ],
      series: [
        {
          name: 'Avg Fatigue Index',
          type: 'bar',
          data: metrics.avgFatigue,
          itemStyle: {
            color: '#5b8ec2',
          },
          markLine: {
            data: [
              {
                yAxis: 75,
                name: 'Fatigue Threshold',
                lineStyle: { color: '#d9a521', type: 'dashed' },
                label: {
                  formatter: 'Caution (75%)',
                  position: 'insideEndTop',
                  color: '#d9a521',
                  fontSize: 9,
                  fontFamily: 'monospace',
                },
              },
            ],
          },
        },
        {
          name: 'Peak Duty (Last 24h)',
          type: 'line',
          yAxisIndex: 1,
          data: metrics.peakDuty,
          itemStyle: {
            color: '#c93b3b',
          },
          lineStyle: {
            width: 1.5,
          },
          markLine: {
            data: [
              {
                yAxis: 12,
                name: 'Duty Limit',
                lineStyle: { color: '#c93b3b', type: 'solid', width: 1.5 },
                label: {
                  formatter: '12h Hard Limit',
                  position: 'insideEndTop',
                  color: '#c93b3b',
                  fontSize: 9,
                  fontFamily: 'monospace',
                },
              },
            ],
          },
        },
      ],
    };
  }, [metrics]);

  return (
    <div
      data-testid="crew-fatigue-chart"
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

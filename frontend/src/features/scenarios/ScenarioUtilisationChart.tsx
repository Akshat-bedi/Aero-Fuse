import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { ScenarioUtilisationSeries } from '@/types';

interface ScenarioUtilisationChartProps {
  series: ScenarioUtilisationSeries;
  className?: string;
}

export const ScenarioUtilisationChart: React.FC<ScenarioUtilisationChartProps> = ({
  series,
  className = '',
}) => {
  const chartOptions = useMemo(() => {
    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#141917',
        borderColor: '#26332c',
        borderWidth: 1,
        padding: [6, 10],
        textStyle: {
          color: '#d7dcd4',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 11,
        },
        formatter: (params: Array<{ seriesName: string; value: number; name: string }>) => {
          let output = `<div style="font-weight: bold; margin-bottom: 4px;">Time Horizon: ${params[0]?.name}</div>`;
          params.forEach((item) => {
            const color = item.seriesName === 'Baseline Plan' ? '#78909c' : '#d9a521';
            output += `
              <div style="display: flex; justify-content: space-between; gap: 12px; font-size: 10px;">
                <span style="color: ${color};">${item.seriesName}:</span>
                <span style="font-weight: bold;">${item.value}% Utilisation</span>
              </div>
            `;
          });
          return output;
        },
      },
      legend: {
        data: ['Baseline Plan', 'What-If Scenario'],
        top: 0,
        right: 10,
        itemWidth: 14,
        itemHeight: 2,
        textStyle: {
          color: '#879a8e',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 10,
        },
      },
      grid: {
        top: 30,
        left: 20,
        right: 25,
        bottom: 25,
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: series.time,
        axisLine: {
          lineStyle: {
            color: '#26332c',
          },
        },
        axisTick: {
          show: false,
        },
        axisLabel: {
          color: '#879a8e',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 9,
        },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 100,
        interval: 25,
        splitLine: {
          lineStyle: {
            color: '#1a231e',
            type: 'dashed',
          },
        },
        axisLabel: {
          color: '#879a8e',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 9,
          formatter: '{value}%',
        },
      },
      series: [
        {
          name: 'Baseline Plan',
          type: 'line',
          smooth: true,
          lineStyle: {
            color: '#78909c',
            width: 1.5,
            type: 'dashed',
          },
          itemStyle: {
            color: '#78909c',
          },
          symbol: 'circle',
          symbolSize: 4,
          data: series.baseline,
        },
        {
          name: 'What-If Scenario',
          type: 'line',
          smooth: true,
          lineStyle: {
            color: '#d9a521',
            width: 2,
          },
          itemStyle: {
            color: '#d9a521',
          },
          symbol: 'rect',
          symbolSize: 5,
          data: series.scenario,
          markLine: {
            symbol: 'none',
            data: [
              {
                yAxis: 80,
                lineStyle: {
                  color: '#d9a521',
                  type: 'dotted',
                  width: 1,
                },
                label: {
                  formatter: '80% Surge Ceiling',
                  position: 'insideEndTop',
                  color: '#d9a521',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 8,
                },
              },
            ],
          },
        },
      ],
    };
  }, [series]);

  return (
    <div className={`w-full ${className}`}>
      <ReactECharts
        option={chartOptions}
        style={{ height: '220px', width: '100%' }}
        opts={{ renderer: 'canvas' }}
      />
    </div>
  );
};

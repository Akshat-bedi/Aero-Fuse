import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { ScenarioKpis } from '@/types';

interface ScenarioKpiBarChartProps {
  baselineKpis: ScenarioKpis;
  scenarioKpis: ScenarioKpis;
  className?: string;
}

export const ScenarioKpiBarChart: React.FC<ScenarioKpiBarChartProps> = ({
  baselineKpis,
  scenarioKpis,
  className = '',
}) => {
  const chartOptions = useMemo(() => {
    const categories = [
      'Missions Fulfilled',
      'P1 Coverage',
      'Fleet Utilisation',
      'Fuel Consumption',
      'Weapons Consumed',
      'Mean Crew Fatigue',
    ];

    const baselineData = [
      baselineKpis.missionsFulfilledPct,
      baselineKpis.p1CoveragePct,
      baselineKpis.aircraftUtilisationPct,
      baselineKpis.fuelConsumptionPct,
      baselineKpis.weaponsConsumptionPct,
      baselineKpis.crewFatigueMean,
    ];

    const scenarioData = [
      scenarioKpis.missionsFulfilledPct,
      scenarioKpis.p1CoveragePct,
      scenarioKpis.aircraftUtilisationPct,
      scenarioKpis.fuelConsumptionPct,
      scenarioKpis.weaponsConsumptionPct,
      scenarioKpis.crewFatigueMean,
    ];

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
        padding: [6, 10],
        textStyle: {
          color: '#d7dcd4',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 11,
        },
        formatter: (params: Array<{ seriesName: string; value: number; name: string }>) => {
          let output = `<div style="font-weight: bold; margin-bottom: 4px;">${params[0]?.name}</div>`;
          params.forEach((item) => {
            const color = item.seriesName === 'Baseline' ? '#78909c' : '#d9a521';
            output += `
              <div style="display: flex; justify-content: space-between; gap: 12px; font-size: 10px;">
                <span style="color: ${color};">${item.seriesName}:</span>
                <span style="font-weight: bold;">${item.value}%</span>
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
        itemWidth: 10,
        itemHeight: 10,
        textStyle: {
          color: '#879a8e',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 10,
        },
      },
      grid: {
        top: 30,
        left: 20,
        right: 20,
        bottom: 25,
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: categories,
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
          interval: 0,
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
          type: 'bar',
          barWidth: '28%',
          itemStyle: {
            color: '#78909c', // steel
            borderRadius: [1, 1, 0, 0],
          },
          data: baselineData,
        },
        {
          name: 'What-If Scenario',
          type: 'bar',
          barWidth: '28%',
          itemStyle: {
            color: '#d9a521', // amber focus
            borderRadius: [1, 1, 0, 0],
          },
          data: scenarioData,
        },
      ],
    };
  }, [baselineKpis, scenarioKpis]);

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

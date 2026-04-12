/**
 * TaskVariables — DB-backed variable editor for tasks.
 * Thin wrapper around VariableManager (mode="uncontrolled").
 */
import VariableManager from './VariableManager';

interface Props {
  taskId: string;
  tradeCategory?: string;
}

export default function TaskVariables({ taskId, tradeCategory }: Props) {
  return (
    <VariableManager mode="uncontrolled" taskId={taskId} tradeCategory={tradeCategory} />
  );
}

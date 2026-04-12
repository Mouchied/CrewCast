/**
 * JobVariables — controlled variable picker/display for jobs.
 * Thin wrapper around VariableManager (mode="controlled").
 */
import VariableManager, {
  jobVariablesToPending,
  type PendingVariable,
} from './VariableManager';

export { PendingVariable, jobVariablesToPending };

interface Props {
  tradeCategory?: string;
  variables?: PendingVariable[];
  onChange?: (variables: PendingVariable[]) => void;
  readOnly?: boolean;
}

export default function JobVariables(props: Props) {
  return <VariableManager mode="controlled" {...props} />;
}

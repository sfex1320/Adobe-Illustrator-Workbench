export { Workbench as PanelApp } from './Workbench';

export interface DemoExtensions {
  addToSelection(ids: string[]): void;
  clearSelection(): void;
  currentSelectionIds(): string[];
  simulateExternalEdit(): void;
  listSessions(): Promise<Array<{ sessionId: string; name: string }>>;
}
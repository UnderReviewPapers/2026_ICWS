import type { BedrockMessage } from "./BedrockMessage";
import type { MissingParameter } from "./parameters";
export interface MCPBedrockHook {
  messages: BedrockMessage[];
  messagesRef: BedrockMessage[];
  isLoading: boolean;
  sendMessage: (message: string) => Promise<void>;
  clearChat: () => void;
  modalVisible: boolean;
  modalParams: MissingParameter[];
  modalInitialValues: Record<string, any>;
  handleModalSubmit: (values: Record<string, any>) => Promise<void>;
  handleModalCancel: () => void;
  debugLog: any[];
  permissionModalVisible: boolean;
  permissionModalData: Record<string, any> | null;
  handlePermissionConfirm: () => Promise<void>;
  handlePermissionCancel: () => void;
  reloadTools: () => Promise<void>;
  instanceSelectionModalVisible: boolean;
  instanceSelectionOptions: any[];
  handleSelectionModalClose: () => void;
  handleSelectionSelect: (selected: any) => void;
  exportDebugLog: (fileName:string) => void;
}
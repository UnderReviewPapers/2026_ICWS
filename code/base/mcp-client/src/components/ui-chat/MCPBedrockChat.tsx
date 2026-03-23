import React, { useState, useEffect, useRef } from 'react';
import { Button, SpaceBetween, Textarea, Spinner, Container, Header, Input } from '@cloudscape-design/components';
import { useMCPBedrock } from '../../hooks/MCPBedrock';
import { useMCPClient } from '../../context/MCPClientProvider';
import './MCPBedrockChat.css';
import Markdown from 'markdown-to-jsx';
import ModalForm from '../ui-form/ui-modal-form';
import CUDConfirmModal from '../ui-modal/ui-confirm-modal'; // adjust path if needed
import InstanceSelectionModal from '../ui-select/ui-select-modal';

const MCPBedrockChat: React.FC<{ bedrockEndpoint: string }> = ({ bedrockEndpoint }) => {
  const [inputMessage, setInputMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const {
    messages,
    isLoading,
    sendMessage,
    clearChat,
    modalVisible,
    modalParams,
    modalInitialValues,
    handleModalSubmit,
    handleModalCancel,
    permissionModalVisible,
    permissionModalData,
    handlePermissionConfirm,
    handlePermissionCancel,
    // Instance selection modal
    instanceSelectionModalVisible,
    instanceSelectionOptions,
    handleSelectionSelect,
    handleSelectionModalClose,
    exportDebugLog

  } = useMCPBedrock(bedrockEndpoint);

  const { isConnected } = useMCPClient();
  const [fileName, setFileName] = React.useState("");


  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || isLoading || !isConnected) return;
    try {
      await sendMessage(inputMessage.trim());
      setInputMessage('');
    } catch (err) {
      console.error('Send failed:', err);
    }
  };

  return (
    <>
    <Container
      className="mcp-bedrock-chat"
      header={
        <Header
          variant="h2"
          actions={<Button onClick={clearChat} disabled={!messages.length}>Clear Chat</Button>}
        >
          Generative AI Chat
        </Header>
      }
    >
      <div className="chat-box">
        <SpaceBetween size="s">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`chat-message ${msg.role}`}
            >
              <strong>{msg.role === 'user' ? 'You' : 'Assistant'}:</strong>
              <div style={{ marginTop: '5px', whiteSpace: 'pre-line' }}><Markdown>{msg.content}</Markdown></div>
            </div>
          ))}
          {isLoading && (
            <div className="chat-spinner">
              <Spinner size="normal" /> <i>Assistant is thinking...</i>
            </div>
          )}
          <div ref={messagesEndRef} />
        </SpaceBetween>
      </div>

      <form onSubmit={handleSubmit}>
        {/* <SpaceBetween direction="vertical" size="s" className="chat-input-container"> */}

          <SpaceBetween direction="horizontal" size="s" className="chat-input-container">
            <Textarea
              className="chat-input"
              placeholder="Type your message..."
              value={inputMessage}
              onChange={({ detail }) => setInputMessage(detail.value)}
              disabled={isLoading || !isConnected}
            />
            <Button
              variant="primary"
              iconName="send"
              className="chat-send-button"
              disabled={isLoading || !inputMessage.trim() || !isConnected}
              formAction="submit"
            >
              Send
            </Button>
          </SpaceBetween>
          
        {/* </SpaceBetween> */}
      </form>

      <ModalForm
        visible={modalVisible}
        title="Please complete the required information"
        onClose={handleModalCancel}
        onSubmit={handleModalSubmit}
        parameters={modalParams}
        initialValues={modalInitialValues}
      />

      <CUDConfirmModal
        visible={permissionModalVisible}
        data={permissionModalData}
        onConfirm={handlePermissionConfirm}
        onCancel={handlePermissionCancel}
      />

      {/* Modal selezione istanza */}
      <InstanceSelectionModal
        visible={instanceSelectionModalVisible}
        options={instanceSelectionOptions}
        onClose={handleSelectionModalClose}
        onSelect={handleSelectionSelect}
      />
    </Container>
    <SpaceBetween direction="horizontal" size="s" className="chat-json-download-container">
            <Input
              onChange={({ detail }) => setFileName(detail.value)}
              value={fileName}
            />
            <Button
              variant="primary"
              iconName="download"
              className="json-download-button"
              formAction="none"
              onClick={() => exportDebugLog(fileName)}
            >
              Download
            </Button>
          </SpaceBetween>
          </>
  );
};

export default MCPBedrockChat;
import React from 'react';
import { Modal, Button, Box, SpaceBetween } from '@cloudscape-design/components';

interface CUDConfirmModalProps {
  visible: boolean;
  data: Record<string, any>;
  onConfirm: () => void;
  onCancel: () => void;
}

const CUDConfirmModal: React.FC<CUDConfirmModalProps> = ({
  visible,
  data,
  onConfirm,
  onCancel,
}) => {
  return (
    <Modal
      visible={visible}
      onDismiss={onCancel}
      header="Confirm Changes"
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={onCancel}>
              Cancel
            </Button>
            <Button variant="primary" onClick={onConfirm}>
              Confirm
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <p>The following changes will be made:</p>
      <Box padding="s" backgroundColor="background-alt">
        <pre style={{ whiteSpace: 'pre-wrap' }}>
          {JSON.stringify(data, null, 2)}
        </pre>
      </Box>
    </Modal>
  );
};

export default CUDConfirmModal;

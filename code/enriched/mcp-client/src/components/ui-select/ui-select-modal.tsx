import React, { useState, useEffect } from "react";
import { Modal, Button, SpaceBetween, Table } from "@cloudscape-design/components";

interface InstanceSelectionModalProps {
  visible: boolean;
  onClose: () => void;
  options: any[];
  onSelect: (selected: any) => void;
  title?: string;
}

const InstanceSelectionModal: React.FC<InstanceSelectionModalProps> = ({
  visible,
  onClose,
  options,
  onSelect,
  title = "Select an instance"
}) => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  useEffect(() => {
    // Reset selection when modal opens or options change
    setSelectedIndex(null);
  }, [visible, options]);

  const columnDefinitions =
    options.length > 0
      ? Object.keys(options[0]).map((key) => ({
          id: key,
          header: key.charAt(0).toUpperCase() + key.slice(1),
          cell: (item: any) => String(item[key]),
        }))
      : [];

  return (
    <Modal
      visible={visible}
      onDismiss={onClose}
      header={title}
      footer={
        <SpaceBetween direction="horizontal" size="xs">
          <Button
            variant="primary"
            onClick={() => {
              if (selectedIndex !== null) {
                onSelect(options[selectedIndex]);
              }
            }}
            disabled={selectedIndex === null}
          >
            Confirm
          </Button>

          <Button variant="link" onClick={onClose}>
            Cancel
          </Button>
        </SpaceBetween>
      }
    >
      <Table
        columnDefinitions={columnDefinitions}
        items={options}
        selectionType="single"
        selectedItems={selectedIndex !== null ? [options[selectedIndex]] : []}
        onSelectionChange={({ detail }) => {
          const selectedItem = detail.selectedItems[0];
          const idx = options.findIndex((o) => o === selectedItem);
          setSelectedIndex(idx !== -1 ? idx : null);
        }}
      />
    </Modal>
  );
};

export default InstanceSelectionModal;

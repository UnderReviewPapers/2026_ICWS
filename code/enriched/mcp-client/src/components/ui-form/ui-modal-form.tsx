import React, { useState, useEffect } from "react";
import {
  Modal,
  FormField,
  Input,
  Button,
  SpaceBetween
} from "@cloudscape-design/components";
import type { MissingParameter } from "../../utils/interfaces/parameters";

interface ModalFormProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (values: Record<string, any>) => void;
  title: string;
  parameters: MissingParameter[];
  initialValues: Record<string, any>;
}

const getInputType = (paramType: string | undefined, label?: string): string => {
  if (!paramType && label?.toLowerCase().includes("time")) return "time";
  switch (paramType) {
    case "number":
    case "integer":
      return "number";
    case "boolean":
      return "checkbox"; // Optional: add checkbox handling if needed
    case "time":
      return "time";
    default:
      return "text";
  }
};

const ModalForm: React.FC<ModalFormProps> = ({
  visible,
  onClose,
  onSubmit,
  title,
  parameters,
  initialValues
}) => {
  const [formState, setFormState] = useState<Record<string, any>>(initialValues);

  useEffect(() => {
    setFormState(initialValues);
  }, [initialValues]);

  const handleChange = (param: string, value: any) => {
    setFormState(prev => ({ ...prev, [param]: value }));
  };

  const handleSubmit = () => {
    onSubmit(formState);    
  };

  return (
    <Modal
      visible={visible}
      onDismiss={onClose}
      header={title}
      footer={
        <SpaceBetween direction="horizontal" size="xs">
          <Button variant="primary" onClick={handleSubmit}>
            Confirm
          </Button>
          <Button variant="link" onClick={onClose}>
            Cancel
          </Button>
        </SpaceBetween>
      }
    >
      <SpaceBetween size="m">
        {parameters.map(param => {
          const inputType = getInputType(param.type, param.label);
          return (
            <FormField key={param.param} label={param.label || param.param}>
              <Input
                type={inputType}
                value={formState[param.param] ?? ""}
                onChange={({ detail }) => handleChange(param.param, detail.value)}
                placeholder={param.text}
              />
            </FormField>
          );
        })}
      </SpaceBetween>
    </Modal>
  );
};

export default ModalForm;

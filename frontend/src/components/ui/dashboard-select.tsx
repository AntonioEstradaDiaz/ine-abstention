"use client";
import {
  Children,
  isValidElement,
  type ReactNode,
  type ComponentPropsWithoutRef,
} from "react";
import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
type Props = Omit<
  ComponentPropsWithoutRef<typeof Select.Trigger>,
  "onChange" | "value" | "defaultValue" | "multiple" | "size"
> & {
  required?: boolean;
  value?: string | number;
  onChange?: (event: { target: { value: string } }) => void;
};
const EMPTY = "__dashboard_empty_option__";
export function DashboardSelect({
  children,
  value,
  onChange,
  disabled,
  name,
  required,
  ...props
}: Props) {
  const options = Children.toArray(children)
    .filter(isValidElement)
    .map((child) => {
      const option = child as React.ReactElement<{
        required?: boolean;
        value?: string | number;
        disabled?: boolean;
        children: ReactNode;
      }>;
      return {
        value: String(option.props.value ?? ""),
        disabled: option.props.disabled,
        label: option.props.children,
      };
    });
  return (
    <Select.Root
      value={String(value ?? "") || EMPTY}
      onValueChange={(next) =>
        onChange?.({ target: { value: next === EMPTY ? "" : next } })
      }
      disabled={disabled}
      name={name}
      required={required}
    >
      <Select.Trigger
        {...props}
        className={`dashboard-select-trigger ${props.className ?? ""}`}
      >
        <Select.Value />
        <Select.Icon className="dashboard-select-chevron">
          <ChevronDown size={14} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          className="dashboard-select-menu"
          position="popper"
          sideOffset={6}
          collisionPadding={12}
        >
          <Select.ScrollUpButton className="dashboard-select-scroll">
            <ChevronUp size={14} />
          </Select.ScrollUpButton>
          <Select.Viewport className="dashboard-select-options">
            {options.map((option) => (
              <Select.Item
                className="dashboard-select-option"
                key={option.value || EMPTY}
                value={option.value || EMPTY}
                disabled={option.disabled}
              >
                <Select.ItemText>{option.label}</Select.ItemText>
                <Select.ItemIndicator className="dashboard-select-check">
                  <Check size={14} />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
          <Select.ScrollDownButton className="dashboard-select-scroll">
            <ChevronDown size={14} />
          </Select.ScrollDownButton>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

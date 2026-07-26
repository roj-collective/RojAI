interface ProductField {
  label: string;
  value: string | number;
}

interface ProductDetailsProps {
  fields: ProductField[];
}

/**
 * Displays a vertical list of product detail fields in bordered boxes.
 */
export function ProductDetails({ fields }: ProductDetailsProps) {
  return (
    <s-stack direction="block" gap="base">
      {fields.map((field) => (
        <s-box
          key={field.label}
          padding="base"
          borderWidth="base"
          borderRadius="base"
        >
          <s-text>
            <strong>{field.label}:</strong> {field.value || "(not set)"}
          </s-text>
        </s-box>
      ))}
    </s-stack>
  );
}

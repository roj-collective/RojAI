import { RECOMMENDATION_THRESHOLD } from "../lib/quality-scorer";

export type StatusFilter = "ALL" | "ACTIVE" | "DRAFT" | "ARCHIVED";
export type QualityFilter = "ALL" | "GOOD" | "NEEDS_ATTENTION";

interface FilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: StatusFilter;
  onStatusChange: (value: StatusFilter) => void;
  qualityFilter: QualityFilter;
  onQualityChange: (value: QualityFilter) => void;
  hasFilters: boolean;
  onClear: () => void;
  filteredCount: number;
  totalCount: number;
}

/**
 * Search and filter controls for the product dashboard.
 * Includes text search, status dropdown, quality dropdown, and a clear button.
 */
export function FilterBar({
  search,
  onSearchChange,
  statusFilter,
  onStatusChange,
  qualityFilter,
  onQualityChange,
  hasFilters,
  onClear,
  filteredCount,
  totalCount,
}: FilterBarProps) {
  return (
    <s-stack direction="block" gap="base">
      <s-box>
        <label>
          <s-text>Search by title: </s-text>
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Type to filter products..."
            aria-label="Search products by title"
            style={{
              padding: "6px 10px",
              borderRadius: "4px",
              border: "1px solid #ccc",
              width: "300px",
            }}
          />
        </label>
      </s-box>
      <s-stack direction="inline" gap="base">
        <s-box>
          <label>
            <s-text>Status: </s-text>
            <select
              value={statusFilter}
              onChange={(e) => onStatusChange(e.target.value as StatusFilter)}
              aria-label="Filter by product status"
              style={{
                padding: "6px 10px",
                borderRadius: "4px",
                border: "1px solid #ccc",
              }}
            >
              <option value="ALL">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="DRAFT">Draft</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </label>
        </s-box>
        <s-box>
          <label>
            <s-text>Quality: </s-text>
            <select
              value={qualityFilter}
              onChange={(e) => onQualityChange(e.target.value as QualityFilter)}
              aria-label="Filter by quality level"
              style={{
                padding: "6px 10px",
                borderRadius: "4px",
                border: "1px solid #ccc",
              }}
            >
              <option value="ALL">All quality levels</option>
              <option value="GOOD">
                Good (≥{RECOMMENDATION_THRESHOLD})
              </option>
              <option value="NEEDS_ATTENTION">
                Needs attention (&lt;{RECOMMENDATION_THRESHOLD})
              </option>
            </select>
          </label>
        </s-box>
        {hasFilters && (
          <s-box>
            <s-button variant="tertiary" onClick={onClear}>
              Clear filters
            </s-button>
          </s-box>
        )}
      </s-stack>
      {hasFilters && (
        <s-text>
          Showing {filteredCount} of {totalCount} products
        </s-text>
      )}
    </s-stack>
  );
}

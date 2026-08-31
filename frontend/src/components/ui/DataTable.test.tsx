import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { DataTable, type Column } from "./DataTable";

interface Row {
  id: string;
  name: string;
  score: number;
}

const rows: Row[] = [
  { id: "1", name: "Charlie", score: 70 },
  { id: "2", name: "Alice", score: 95 },
  { id: "3", name: "Bob", score: 82 },
];

const columns: Column<Row>[] = [
  { id: "name", header: "Name", cell: (r) => r.name, sortValue: (r) => r.name },
  {
    id: "score",
    header: "Score",
    align: "right",
    cell: (r) => r.score,
    sortValue: (r) => r.score,
  },
];

function firstColumnOrder() {
  const table = screen.getByRole("table");
  const bodyRows = within(table).getAllByRole("row").slice(1); // skip header
  return bodyRows.map((tr) => within(tr).getAllByRole("cell")[0].textContent);
}

describe("DataTable", () => {
  it("sorts ascending then descending when a header is clicked", () => {
    render(<DataTable data={rows} columns={columns} getRowId={(r) => r.id} />);

    fireEvent.click(screen.getByRole("button", { name: /name/i }));
    expect(firstColumnOrder()).toEqual(["Alice", "Bob", "Charlie"]);

    fireEvent.click(screen.getByRole("button", { name: /name/i }));
    expect(firstColumnOrder()).toEqual(["Charlie", "Bob", "Alice"]);
  });

  it("filters rows via the search box", () => {
    render(
      <DataTable
        data={rows}
        columns={columns}
        getRowId={(r) => r.id}
        searchable={(r) => r.name}
        searchPlaceholder="Search names"
      />,
    );
    fireEvent.change(screen.getByLabelText("Search names"), {
      target: { value: "ali" },
    });
    expect(firstColumnOrder()).toEqual(["Alice"]);
  });

  it("renders the empty state when there are no rows", () => {
    render(
      <DataTable
        data={[]}
        columns={columns}
        getRowId={(r) => r.id}
        empty={<div>Nothing here</div>}
      />,
    );
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
  });

  it("calls onRowClick when a row is activated", () => {
    let clicked = "";
    render(
      <DataTable
        data={rows}
        columns={columns}
        getRowId={(r) => r.id}
        onRowClick={(r) => {
          clicked = r.name;
        }}
      />,
    );
    // Scope to the desktop table (a mobile card duplicate also exists in the DOM).
    const table = screen.getByRole("table");
    fireEvent.click(within(table).getByText("Charlie"));
    expect(clicked).toBe("Charlie");
  });
});

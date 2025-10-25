import React, { useEffect, useState, useMemo, useRef } from "react";
import Select, { components } from "react-select";
import { FaBars, FaSpinner } from "react-icons/fa";
import "./TicketDashboard.css";

const ASSIGNEE_COL_ID = 4549002565209988;
const OPEN_STATUS_COL_ID = 1001;
const HOLD_STATUS_COL_ID = 1003;
const ESCALATED_STATUS_COL_ID = 1004;
const UNASSIGNED_STATUS_COL_ID = 1005;
const IN_PROGRESS_STATUS_COL_ID = 1006;

const backendurl = "http://localhost:5000";
const CANDIDATES_PER_PAGE = 15;
const AGENTS_PER_PAGE = 30;

const Option = (props) => (
  <components.Option {...props}>
    <span
      className={`custom-checkbox${props.isSelected ? " checked" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        props.selectOption(props.data);
      }}
      style={{ cursor: "pointer" }}
    />
    <span style={{ fontSize: "11px", marginLeft: 8, verticalAlign: "middle" }}>
      {props.label}
    </span>
  </components.Option>
);

const selectStyles = {
  control: (base) => ({
    ...base,
    minWidth: 80,
    maxWidth: 200,
    height: 40,
    background: "linear-gradient(145deg, #d0daf9, #a3baff)",
    borderRadius: 18,
    border: "1px solid #5e7ce4",
    boxShadow:
      "8px 8px 28px rgba(63,81,181,0.8), inset 6px 6px 14px #fff, inset -6px -6px 14px rgba(48,62,142,0.85)",
    fontWeight: 900,
    fontSize: 12,
    textTransform: "uppercase",
    fontFamily: "'Poppins',sans-serif",
    padding: "0 1px",
  }),
  option: (base) => ({
    ...base,
    fontSize: "10px",
    fontWeight: 900,
  }),
  valueContainer: (base) => ({
    ...base,
    paddingRight: 0,
  }),
  multiValue: () => ({ display: "none" }),
  multiValueLabel: () => ({ display: "none" }),
  menuPortal: (base) => ({ ...base, zIndex: 9999 }),
};

const DepartmentOption = (props) => {
  const [expanded, setExpanded] = useState(false);
  const { isSelected, selectOption, label } = props;
  const deptAgentMap = props.data.deptAgentMap || {};
  const agentNames = deptAgentMap[String(props.data.value)] || [];
  const handleExpand = (e) => {
    e.stopPropagation();
    setExpanded((v) => !v);
  };
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <span
          className={`custom-checkbox${isSelected ? " checked" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            selectOption(props.data);
          }}
          style={{ cursor: "pointer", marginRight: 6 }}
        />
        <span style={{ fontSize: "11px", flex: 1 }}>{label}</span>
        <span
          style={{
            cursor: "pointer",
            fontWeight: 900,
            fontSize: 14,
            marginLeft: 6,
          }}
          onClick={handleExpand}
        >
          {expanded ? "▼" : "▶"}
        </span>
      </div>
      {expanded && (
        <div
          style={{
            marginLeft: 24,
            marginTop: 4,
            padding: "4px 6px",
            background: "#dae3f7",
            borderRadius: 6,
            color: "#222",
            fontSize: "10px",
          }}
        >
          {agentNames.length > 0 ? (
            agentNames.map((name, idx) => <div key={name + "_" + idx}>{name}</div>)
          ) : (
            <div style={{ color: "#888" }}>No agents</div>
          )}
        </div>
      )}
    </div>
  );
};

function getAgentDisplayCount(counts, selectedStatusKeys) {
  const selectedStatusesExcludingTotal = selectedStatusKeys.filter((k) => k !== "total");
  const showSumOnly = selectedStatusKeys.includes("total") && selectedStatusesExcludingTotal.length > 0;
  const sumSelectedStatuses = selectedStatusesExcludingTotal.reduce(
    (sum, key) => sum + (counts[key] || 0),
    0
  );
  if (showSumOnly) return sumSelectedStatuses;
  if (selectedStatusesExcludingTotal.length > 0)
    return selectedStatusesExcludingTotal.map((key) => counts[key] || 0).join(" / ");
  return (
    (counts.open || 0) +
    (counts.hold || 0) +
    (counts.escalated || 0) +
    (counts.unassigned || 0) +
    (counts.inProgress || 0)
  );
}
function TicketDashboard() {
  const hasFetchedRef = useRef(false);
  const [rows, setRows] = useState(() => {
    const saved = localStorage.getItem("ticketDashboardRows");
    return saved ? JSON.parse(saved) : [];
  });
  const [departmentsList, setDepartmentsList] = useState([]);
  
  const [membersData, setMembersData] = useState(() => {
    const saved = localStorage.getItem("ticketDashboardMembers");
    return saved ? JSON.parse(saved) : [];
  });
  
  const [departmentMembersMap, setDepartmentMembersMap] = useState({});
  const [selectedDepartments, setSelectedDepartments] = useState([]);
  const [selectedCandidates, setSelectedCandidates] = useState([]);
  const [selectedStatuses, setSelectedStatuses] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [currentDeptPage, setCurrentDeptPage] = useState(1);
  const [currentAgentPage, setCurrentAgentPage] = useState(1);
  const [sortOrder, setSortOrder] = useState("asc");
  const [loading, setLoading] = useState(false);
  const [filtersVisible, setFiltersVisible] = useState(false);
  
  const [unassignedTicketNumbers, setUnassignedTicketNumbers] = useState(() => {
    const saved = localStorage.getItem("unassignedTicketNumbers");
    return saved ? JSON.parse(saved) : [];
  });
  
  const [currentUnassignedIndex, setCurrentUnassignedIndex] = useState(0);
  const [openSum, setOpenSum] = useState(null);
  const [holdSum, setHoldSum] = useState(null);
  const [escalatedSum, setEscalatedSum] = useState(null);
  const [inProgressSum, setInProgressSum] = useState(null);
  const [globalUnassignedSum, setGlobalUnassignedSum] = useState(null);
  const [filteredCandidates, setFilteredCandidates] = useState([]);
  const [departmentRows, setDepartmentRows] = useState([]);
  const [departmentSummaryRows, setDepartmentSummaryRows] = useState([]);
  const [error, setError] = useState(null);

  const statusOptions = [
    { value: "open", label: "Open" },
    { value: "hold", label: "Hold" },
    { value: "inProgress", label: "In Progress" },
    { value: "escalated", label: "Escalated" },
    { value: "unassigned", label: "Unassigned" },
    { value: "total", label: "Total" },
  ];

  useEffect(() => {
    async function refreshDepartments() {
      localStorage.removeItem("departmentsList");
      try {
        const res = await fetch(`${backendurl}/api/zoho-departments`);
        if (res.ok) {
          const data = await res.json();
          setDepartmentsList(data.departments || []);
          localStorage.setItem("departmentsList", JSON.stringify(data.departments || []));
        }
      } catch (err) {}
    }
    refreshDepartments();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${backendurl}/api/zoho-assignees-with-ticket-counts`);
      if (res.ok) {
        const data = await res.json();
        setMembersData(data.members || []);
        setUnassignedTicketNumbers(data.unassignedTicketNumbers || []);
        localStorage.setItem("ticketDashboardMembers", JSON.stringify(data.members || []));
        localStorage.setItem("ticketDashboardRows", JSON.stringify(data.members || []));
        localStorage.setItem("unassignedTicketNumbers", JSON.stringify(data.unassignedTicketNumbers || []));
      }
    } catch (err) {
      console.error("Error fetching dashboard data:", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchDashboardData();
    const intervalId = setInterval(fetchDashboardData, 300000);
    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (unassignedTicketNumbers.length > 0) {
      const latestTicketNum = unassignedTicketNumbers[currentUnassignedIndex] || unassignedTicketNumbers[0];
      localStorage.setItem("latestUnassignedTicketNumber", latestTicketNum);
    }
  }, [unassignedTicketNumbers, currentUnassignedIndex]);

  const getStoredTicketNumber = () => {
    const saved = localStorage.getItem("latestUnassignedTicketNumber");
    return saved ? saved.toString().padStart(5, "0") : "00000";
  };

  useEffect(() => {
    async function fetchMembersForDepartments(departments) {
      const map = {};
      for (const dept of departments) {
        try {
          const resp = await fetch(`${backendurl}/api/department-members/${dept.id}`);
          if (!resp.ok) throw new Error("Failed to fetch department members");
          const data = await resp.json();
          map[dept.id] = data.members.map(
            (m) => m.displayName || m.fullName || m.name || m.email || "Unknown"
          );
        } catch {
          map[dept.id] = [];
        }
      }
      setDepartmentMembersMap(map);
    }
    if (departmentsList.length > 0) fetchMembersForDepartments(departmentsList);
  }, [departmentsList]);

  useEffect(() => {
    if (unassignedTicketNumbers.length > 0) {
      const interval = setInterval(() => {
        setCurrentUnassignedIndex((prev) => (prev + 1) % unassignedTicketNumbers.length);
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [unassignedTicketNumbers]);

  useEffect(() => {
    if (!membersData || membersData.length === 0) return;
    const newRows = membersData.map((member) => ({
      cells: [
        { columnId: ASSIGNEE_COL_ID, value: member.name },
        { columnId: OPEN_STATUS_COL_ID, value: (member.tickets.open || 0).toString() },
        { columnId: HOLD_STATUS_COL_ID, value: (member.tickets.hold || 0).toString() },
        { columnId: ESCALATED_STATUS_COL_ID, value: (member.tickets.escalated || 0).toString() },
        { columnId: UNASSIGNED_STATUS_COL_ID, value: (member.tickets.unassigned || 0).toString() },
        { columnId: IN_PROGRESS_STATUS_COL_ID, value: (member.tickets.inProgress || 0).toString() },
      ],
      departmentIds: member.departmentIds || [],
      latestUnassignedTicketId: member.latestUnassignedTicketId || null,
      key: (member.departmentIds ? member.departmentIds.join(",") : "no_department") + "_" + member.id,
    }));
    setRows(newRows);
    localStorage.setItem("ticketDashboardRows", JSON.stringify(newRows));
  }, [membersData]);

  useEffect(() => {
    localStorage.setItem("selectedDepartments", JSON.stringify(selectedDepartments));
    localStorage.setItem("selectedCandidates", JSON.stringify(selectedCandidates));
    localStorage.setItem("selectedStatuses", JSON.stringify(selectedStatuses));
    localStorage.setItem("departmentRows", JSON.stringify(departmentRows));
    localStorage.setItem("departmentSummaryRows", JSON.stringify(departmentSummaryRows));
  }, [selectedDepartments, selectedCandidates, selectedStatuses, departmentRows, departmentSummaryRows]);

  useEffect(() => {
    let open = 0, hold = 0, escalated = 0, inProgress = 0, unassigned = 0;
    rows.forEach((row) => {
      if (Array.isArray(row.cells)) {
        row.cells.forEach((cell) => {
          if (cell.columnId === OPEN_STATUS_COL_ID) open += Number(cell.value || 0);
          if (cell.columnId === HOLD_STATUS_COL_ID) hold += Number(cell.value || 0);
          if (cell.columnId === ESCALATED_STATUS_COL_ID) escalated += Number(cell.value || 0);
          if (cell.columnId === IN_PROGRESS_STATUS_COL_ID) inProgress += Number(cell.value || 0);
          if (cell.columnId === UNASSIGNED_STATUS_COL_ID) unassigned += Number(cell.value || 0);
        });
      }
    });
    setOpenSum(open);
    setHoldSum(hold);
    setEscalatedSum(escalated);
    setInProgressSum(inProgress);
    setGlobalUnassignedSum(unassigned);
  }, [rows]);
  const candidateOptions = useMemo(() => {
    const validNames = [];
    rows.forEach((row) => {
      const cells = Array.isArray(row.cells) ? row.cells : [];
      const name = cells.find((c) => c.columnId === ASSIGNEE_COL_ID)?.value?.trim();
      if (!name) return;
      const ticketCounts = cells
        .filter((cell) =>
          [
            OPEN_STATUS_COL_ID,
            HOLD_STATUS_COL_ID,
            ESCALATED_STATUS_COL_ID,
            UNASSIGNED_STATUS_COL_ID,
            IN_PROGRESS_STATUS_COL_ID,
          ].includes(cell.columnId)
        )
        .map((cell) => Number(cell.value || 0));
      if (ticketCounts.some((count) => count > 0)) validNames.push(name);
    });
    return Array.from(new Set(validNames))
      .sort()
      .map((name) => ({ value: name, label: name }));
  }, [rows]);

  const selectedStatusKeys = useMemo(
    () =>
      selectedStatuses.length > 0
        ? selectedStatuses.map((s) => s.value)
        : statusOptions.map((s) => s.value),
    [selectedStatuses]
  );

  const personFilterOption = (option, inputValue) => {
    if (!inputValue) return true;
    if (selectedCandidates.find((sel) => sel.value === option.value)) return true;
    return option.label.toLowerCase().includes(inputValue.toLowerCase());
  };

  const [gridCells, setGridCells] = useState([]);
  const intervalRef = useRef(null);
  useEffect(() => {
    let dataSource = rows;
    if (selectedDepartments.length > 0) {
      const allowedDeptIds = selectedDepartments.map((dep) => String(dep.value));
      dataSource = membersData
        .filter(
          (member) =>
            member.departmentIds && member.departmentIds.some((id) => allowedDeptIds.includes(id))
        )
        .map((member) => ({
          cells: [
            { columnId: ASSIGNEE_COL_ID, value: member.name },
            { columnId: OPEN_STATUS_COL_ID, value: member.tickets.open?.toString() || "0" },
            { columnId: HOLD_STATUS_COL_ID, value: member.tickets.hold?.toString() || "0" },
            { columnId: ESCALATED_STATUS_COL_ID, value: member.tickets.escalated?.toString() || "0" },
            { columnId: UNASSIGNED_STATUS_COL_ID, value: member.tickets.unassigned?.toString() || "0" },
            { columnId: IN_PROGRESS_STATUS_COL_ID, value: member.tickets.inProgress?.toString() || "0" },
          ],
          departmentIds: member.departmentIds || [],
          latestUnassignedTicketId: member.latestUnassignedTicketId || null,
          key:
            (member.departmentIds ? member.departmentIds.join(",") : "no_department") +
            "_" +
            member.id,
        }));
    }
    if (selectedCandidates.length > 0) {
      const allowedNames = selectedCandidates.map((c) => c.value.trim().toLowerCase());
      dataSource = dataSource.filter((row) =>
        allowedNames.includes(
          row.cells.find((c) => c.columnId === ASSIGNEE_COL_ID)?.value?.trim().toLowerCase()
        )
      );
    }
    const filteredCandidatesArr = dataSource.map((row) => {
      const cells = Array.isArray(row.cells) ? row.cells : [];
      return [
        cells.find((c) => c.columnId === ASSIGNEE_COL_ID)?.value,
        {
          open: Number(cells.find((c) => c.columnId === OPEN_STATUS_COL_ID)?.value || 0),
          hold: Number(cells.find((c) => c.columnId === HOLD_STATUS_COL_ID)?.value || 0),
          escalated: Number(cells.find((c) => c.columnId === ESCALATED_STATUS_COL_ID)?.value || 0),
          unassigned: Number(cells.find((c) => c.columnId === UNASSIGNED_STATUS_COL_ID)?.value || 0),
          inProgress: Number(cells.find((c) => c.columnId === IN_PROGRESS_STATUS_COL_ID)?.value || 0),
          latestUnassignedTicketId: row.latestUnassignedTicketId || null,
        },
      ];
    });
    setFilteredCandidates(filteredCandidatesArr);

    const sorted = [...filteredCandidatesArr].sort((a, b) => {
      if (a[0] < b[0]) return sortOrder === "asc" ? -1 : 1;
      if (a[0] > b[0]) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    const nonZero = sorted.filter(
      ([, c]) => c.open > 0 || c.hold > 0 || c.escalated > 0 || c.unassigned > 0 || c.inProgress > 0
    );

    const totalPages = Math.ceil(nonZero.length / CANDIDATES_PER_PAGE);
    if (currentPage > totalPages && totalPages > 0) setCurrentPage(1);
    const start = (currentPage - 1) * CANDIDATES_PER_PAGE;
    const end = Math.min(start + CANDIDATES_PER_PAGE, nonZero.length);

    const cells = [];
    for (let i = start; i < end; i++) {
      const [candidate, counts] = nonZero[i];
      cells.push(
        <div key={candidate} className="grid-cell" style={{ animationDelay: `${(i - start) * 65}ms` }}>
          <div className="candidate-name">{candidate}</div>
          <div className="ticket-counts" style={{ justifyContent: "center", display: "flex", gap: 10 }}>
            <div className="count-box total">{getAgentDisplayCount(counts, selectedStatusKeys)}</div>
          </div>
        </div>
      );
    }
    setGridCells(cells);
  }, [
    rows,
    membersData,
    departmentRows,
    currentPage,
    sortOrder,
    selectedDepartments,
    selectedCandidates,
    selectedStatuses,
  ]);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    const rowCount = filteredCandidates.length;
    const totalPages = Math.ceil(rowCount / CANDIDATES_PER_PAGE);
    if (totalPages > 1) {
      intervalRef.current = setInterval(() => {
        setCurrentPage((prev) => (prev < totalPages ? prev + 1 : 1));
      }, 10000);
    }
    return () => intervalRef.current && clearInterval(intervalRef.current);
  }, [filteredCandidates]);

  const departmentDropdownOptions = useMemo(() => {
    return departmentsList.map((dep, idx) => ({
      value: dep.id,
      label: dep.name,
      key: String(dep.id) + "_" + idx,
      deptAgentMap: departmentMembersMap,
    }));
  }, [departmentsList, departmentMembersMap]);

  const totalDeptPages = departmentDropdownOptions.length;
  
  // UPDATED: Show only selected departments with pagination
  const currentDepartments = useMemo(() => {
    if (selectedDepartments.length === 0) return [];
    return selectedDepartments.slice(currentDeptPage - 1, currentDeptPage);
  }, [selectedDepartments, currentDeptPage]);

  // Reset page when departments change
  useEffect(() => {
    if (currentDeptPage > selectedDepartments.length && selectedDepartments.length > 0) {
      setCurrentDeptPage(1);
    }
  }, [selectedDepartments, currentDeptPage]);

  const departmentBgColors = [
    "linear-gradient(135deg, #6a80ff 30%, #8edeff 100%)",
    "linear-gradient(135deg, #d5ff80 30%, #ffc164 100%)",
    "linear-gradient(135deg, #ffb1b1 30%, #d592ff 100%)",
    "linear-gradient(135deg, #6ef9a0 30%, #58d6ff 100%)",
    "linear-gradient(135deg, #ffe298 30%, #ff8e91 100%)",
  ];

  const showLegendTotal = selectedStatuses.some((s) => s.value === "total");

  const currentTicketNumber =
    unassignedTicketNumbers.length > 0
      ? unassignedTicketNumbers[currentUnassignedIndex].toString().padStart(5, "0")
      : getStoredTicketNumber();
  let departmentGrids = null;
  if (selectedDepartments.length > 0 && currentDepartments.length > 0) {
    departmentGrids = (
      <>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "5px",
            marginTop: "20px",
            position: "relative",
            width: "100%",
            maxWidth: "calc(1400px + 40px)",
            margin: "20px auto 0 auto",
            padding: "0",
            boxSizing: "border-box",
          }}
        >
          {/* Left Arrow */}
          {selectedDepartments.length > 1 && (
            <div
              onClick={() => {
                setCurrentDeptPage(
                  currentDeptPage > 1 ? currentDeptPage - 1 : selectedDepartments.length
                );
              }}
              style={{
                fontSize: "48px",
                fontWeight: "bold",
                color: "#ffd700",
                cursor: "pointer",
                userSelect: "none",
                transition: "transform 0.2s ease, color 0.2s ease",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                padding: "0 5px",
                margin: "0",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "scale(1.2)";
                e.currentTarget.style.color = "#fff";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "scale(1)";
                e.currentTarget.style.color = "#ffd700";
              }}
            >
              ‹
            </div>
          )}

          {/* Department Box Container */}
          <div
            style={{
              flex: 1,
              display: "flex",
              justifyContent: "center",
              width: "100%",
              maxWidth: "1400px",
            }}
          >
            {currentDepartments.map((dep) => {
              const allowedDeptId = String(dep.value);

              // Get agents from membersData who are in this department
              const departmentMembersRows = membersData.filter(
                (m) => Array.isArray(m.departmentIds) && m.departmentIds.includes(allowedDeptId)
              );

              // Get ALL department members from the dropdown data (includes members with 0 tickets)
              const allDepartmentMemberNames = departmentMembersMap[allowedDeptId] || [];

              // Create a Map for deduplication
              const uniqueAgentsMap = new Map();

              // Add all agents from membersData
              departmentMembersRows.forEach((agent) => {
                const normalizedName = agent.name.trim().toLowerCase();
                const totalTickets =
                  (agent.tickets?.open || 0) +
                  (agent.tickets?.hold || 0) +
                  (agent.tickets?.escalated || 0) +
                  (agent.tickets?.unassigned || 0) +
                  (agent.tickets?.inProgress || 0);

                if (!uniqueAgentsMap.has(normalizedName)) {
                  uniqueAgentsMap.set(normalizedName, {
                    id: agent.id,
                    name: agent.name.trim(),
                    totalTickets: totalTickets,
                  });
                } else {
                  const existing = uniqueAgentsMap.get(normalizedName);
                  if (totalTickets > existing.totalTickets) {
                    uniqueAgentsMap.set(normalizedName, {
                      id: agent.id,
                      name: agent.name.trim(),
                      totalTickets: totalTickets,
                    });
                  }
                }
              });

              // Add all department members from dropdown without tickets
              allDepartmentMemberNames.forEach((name) => {
                const normalizedName = name.trim().toLowerCase();
                if (!uniqueAgentsMap.has(normalizedName)) {
                  uniqueAgentsMap.set(normalizedName, {
                    id: null,
                    name: name.trim(),
                    totalTickets: 0,
                  });
                }
              });

              // Convert Map to sorted array
              const agentsToShow = Array.from(uniqueAgentsMap.values()).sort((a, b) =>
                a.name.localeCompare(b.name)
              );

              const agentCards = agentsToShow.map((agent, index) => {
                const filteredTicketCount = agent.totalTickets;

                return (
                  <div
                    key={agent.id || `${dep.value}_${index}`}
                    style={{
                      background: "rgba(32, 50, 98, 0.96)",
                      borderRadius: 18,
                      boxShadow: "0 2px 12px #34495e36, inset 0 2px 8px #ffc80013",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      padding: "12px 8px",
                      border: "3px solid #4ea1eb",
                      width: "100%",
                      minWidth: 180,
                      maxWidth: 200,
                      boxSizing: "border-box",
                    }}
                  >
                    <div
                      style={{
                        color: "#fff",
                        fontWeight: 700,
                        fontSize: 18,
                        textAlign: "center",
                        marginBottom: 6,
                        wordBreak: "break-word",
                        width: "100%",
                        minHeight: "48px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {agent.name}
                    </div>
                    <div
                      style={{
                        fontSize: 16,
                        fontWeight: 900,
                        background: "#EF6724",
                        color: "White",
                        borderRadius: 9,
                        padding: "3px 15px",
                        margin: "0 auto",
                      }}
                    >
                      {filteredTicketCount}
                    </div>
                  </div>
                );
              });

              return (
                <div
                  key={dep.value}
                  style={{
                    background:
                      departmentBgColors[
                        (currentDeptPage - 1) % departmentBgColors.length
                      ],
                    borderRadius: 32,
                    boxShadow: "0 8px 40px rgba(31,80,154,0.14)",
                    padding: "24px 20px",
                    width: "100%",
                    minHeight: 420,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    boxSizing: "border-box",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      background: "#1E4489",
                      color: "white",
                      fontWeight: "bold",
                      fontSize: 26,
                      padding: "10px 10px",
                      borderRadius: 17,
                      textAlign: "center",
                      marginBottom: 15,
                      maxWidth: 360,
                      width: "350px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 20,
                    }}
                  >
                    {dep.label.toUpperCase()}
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 200px))",
                      gap: "10px",
                      alignItems: "stretch",
                      justifyContent: "center",
                      width: "100%",
                      margin: "0 auto",
                      padding: "0 10px",
                      boxSizing: "border-box",
                    }}
                  >
                    {agentCards}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right Arrow */}
          {selectedDepartments.length > 1 && (
            <div
              onClick={() => {
                setCurrentDeptPage(
                  currentDeptPage < selectedDepartments.length ? currentDeptPage + 1 : 1
                );
              }}
              style={{
                fontSize: "48px",
                fontWeight: "bold",
                color: "#ffd700",
                cursor: "pointer",
                userSelect: "none",
                transition: "transform 0.2s ease, color 0.2s ease",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                padding: "0 5px",
                margin: "0",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "scale(1.2)";
                e.currentTarget.style.color = "#fff";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "scale(1)";
                e.currentTarget.style.color = "#ffd700";
              }}
            >
              ›
            </div>
          )}
        </div>
      </>
    );
    } else {
    departmentGrids = (
      <div
        className="grid-container"
        style={{
          marginTop: 32,
          display: "grid",
          gap: "18px",
          gridTemplateColumns: "repeat(5, 1fr)",
          gridTemplateRows: "repeat(3, auto)",
          maxWidth: 1450,
          marginLeft: "auto",
          marginRight: "auto",
          padding: "0 20px",
        }}
      >
        {gridCells}
      </div>
    );
  }

  return (
    <>
      <div
        className="dashboard-header-main"
        style={{
          maxWidth: "100%",
          margin: "0 auto 30px auto",
          position: "relative",
          padding: "0",
          boxSizing: "border-box",
        }}
      >
        <div
          className="dashboard-header-top"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            position: "relative",
            padding: "0 20px",
          }}
        >
          <img
            className="header-image"
            src="/suprajit_logo_BG.png"
            alt="Left icon"
            style={{ height: 80, width: "auto" }}
          />
          <div
            className="dashboard-title-container"
            style={{
              fontWeight: 900,
              fontSize: 60,
              letterSpacing: 2,
              color: "#e0eaff",
              textShadow: "2px 2px 6px rgba(0, 0, 50, 0.7)",
              userSelect: "none",
              textTransform: "uppercase",
              position: "relative",
              zIndex: 2,
            }}
          >
            TICKET DASHBOARD
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: 10,
              position: "relative",
              zIndex: 2,
            }}
          >
            <img
              className="header-image"
              src="/IT-LOGO.png"
              alt="Right icon"
              style={{ height: 70, width: "auto" }}
            />
          </div>
        </div>
        <div
          className="dashboard-header-filters"
          style={{
            maxWidth: 1400,
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            padding: "0 20px",
          }}
        >
          <div style={{ height: 40 }} />
          <div
            className="legend-bar"
            style={{
              display: "flex",
              gap: 10,
              flex: filtersVisible ? "initial" : 1,
              transition: "flex 0.3s ease",
            }}
          >
            <div
              className="legend-item open"
              style={{ flex: 1, textAlign: "center", fontSize: 20, fontWeight: 900 }}
            >
              OPEN{" "}
              <span style={{ fontWeight: 900, marginLeft: 4 }}>
                {openSum !== null ? openSum.toString().padStart(3, "0") : "--"}
              </span>
            </div>
            <div
              className="legend-item hold"
              style={{ flex: 1, textAlign: "center", fontSize: 22, fontWeight: 900 }}
            >
              HOLD{" "}
              <span style={{ fontWeight: 900, marginLeft: 4 }}>
                {holdSum !== null ? holdSum.toString().padStart(3, "0") : "--"}
              </span>
            </div>
            <div
              className="legend-item inprogress"
              style={{ flex: 1, textAlign: "center", fontSize: 20, fontWeight: 900 }}
            >
              IN PROGRESS{" "}
              <span style={{ fontWeight: 900, marginLeft: 4 }}>
                {inProgressSum !== null ? inProgressSum.toString().padStart(3, "0") : "--"}
              </span>
            </div>
            <div
              className="legend-item escalated"
              style={{ flex: 1, textAlign: "center", fontSize: 20, fontWeight: 900 }}
            >
              ESCALATED{" "}
              <span style={{ fontWeight: 900, marginLeft: 4 }}>
                {escalatedSum !== null ? escalatedSum.toString().padStart(3, "0") : "--"}
              </span>
            </div>
            <div
              className="unassigned-box-blink"
              style={{
                flex: 1,
                textAlign: "center",
                fontWeight: 900,
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                gap: 10,
                paddingLeft: 24,
                paddingRight: 0,
              }}
            >
              UNASSIGNED{" "}
              <span>
                {globalUnassignedSum !== null
                  ? globalUnassignedSum.toString().padStart(3, "0")
                  : "--"}
              </span>
              <span
                style={{
                  background: "#1e4489",
                  color: "#fff",
                  borderRadius: 14,
                  fontWeight: 900,
                  fontSize: 30,
                  userSelect: "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "120px",
                  height: "60px",
                  minWidth: "120px",
                  minHeight: "60px",
                  letterSpacing: 2,
                  boxSizing: "border-box",
                }}
              >
                {globalUnassignedSum > 0 ? currentTicketNumber : "00000"}
              </span>
            </div>
            {showLegendTotal && (
              <div
                className="legend-item total"
                style={{
                  backgroundColor: "#ffd700",
                  color: "#1e4489",
                  fontWeight: 700,
                  borderRadius: 12,
                  padding: "0 10px",
                  flex: 1,
                  textAlign: "center",
                  fontSize: 20,
                }}
              >
                TOTAL{" "}
                <span>
                  {(
                    (selectedStatusKeys.includes("open") ? openSum || 0 : 0) +
                    (selectedStatusKeys.includes("hold") ? holdSum || 0 : 0) +
                    (selectedStatusKeys.includes("inProgress") ? inProgressSum || 0 : 0) +
                    (selectedStatusKeys.includes("escalated") ? escalatedSum || 0 : 0) +
                    (selectedStatusKeys.includes("unassigned") ? globalUnassignedSum || 0 : 0)
                  )
                    .toString()
                    .padStart(3, "0")}
                </span>
              </div>
            )}
          </div>
          <button
            className="hamburger-btn"
            style={{
              width: 30,
              height: 30,
              borderRadius: 10,
              border: "none",
              cursor: "pointer",
              marginLeft: 20,
              display: "block",
            }}
            onClick={() => setFiltersVisible((v) => !v)}
            aria-label="Toggle filters"
          >
            <FaBars size={18} color="#34495e" />
          </button>
          {filtersVisible && (
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ minWidth: 160 }}>
                <Select
                  closeMenuOnSelect={false}
                  hideSelectedOptions={false}
                  components={{ Option }}
                  isMulti
                  options={candidateOptions}
                  value={selectedCandidates}
                  onChange={setSelectedCandidates}
                  placeholder="AGENTS"
                  styles={selectStyles}
                  menuPortalTarget={document.body}
                  filterOption={personFilterOption}
                  isSearchable
                  menuPlacement="auto"
                  maxMenuHeight={240}
                />
              </div>
              <div style={{ minWidth: 24 }} />
              <div style={{ minWidth: 150 }}>
                <Select
                  closeMenuOnSelect={false}
                  hideSelectedOptions={false}
                  components={{ Option: DepartmentOption }}
                  isMulti
                  options={departmentDropdownOptions}
                  value={selectedDepartments}
                  onChange={setSelectedDepartments}
                  placeholder="DEPARTMENTS"
                  styles={selectStyles}
                  menuPortalTarget={document.body}
                  isSearchable
                  menuPlacement="auto"
                  maxMenuHeight={280}
                />
              </div>
              <div style={{ minWidth: 160 }}>
                <Select
                  closeMenuOnSelect={false}
                  hideSelectedOptions={false}
                  components={{ Option }}
                  isMulti
                  options={statusOptions}
                  value={selectedStatuses}
                  onChange={setSelectedStatuses}
                  placeholder="STATUSES"
                  styles={selectStyles}
                  menuPortalTarget={document.body}
                />
              </div>
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                style={{ height: 40, width: 40, borderRadius: 10 }}
              >
                <option value="asc">Asc</option>
                <option value="desc">Desc</option>
              </select>
            </div>
          )}
        </div>
        {/* {loading && (
          <div style={{ display: "flex", justifyContent: "center", marginTop: 10 }}>
            <FaSpinner className="spinning-icon" />
          </div>
        )} */}
        {departmentGrids}
      </div>
    </>
  );
}

export default TicketDashboard;

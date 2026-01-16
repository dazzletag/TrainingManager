import { TextField, MenuItem, Stack } from "@mui/material";
import { useUserContext } from "../context/UserContext";

const roles = [
  { value: "staff", label: "Staff View" },
  { value: "manager", label: "Manager View" },
  { value: "admin", label: "Admin View" },
];

export function RoleSwitcher() {
  const { role, setRole, personExternalId, setPersonExternalId, userEmail, setUserEmail } =
    useUserContext();

  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <TextField
        select
        size="small"
        value={role}
        onChange={(event) => setRole(event.target.value as typeof role)}
        sx={{ minWidth: 160 }}
      >
        {roles.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        size="small"
        value={personExternalId}
        onChange={(event) => setPersonExternalId(event.target.value)}
      />
      <TextField
        size="small"
        value={userEmail}
        onChange={(event) => setUserEmail(event.target.value)}
      />
    </Stack>
  );
}

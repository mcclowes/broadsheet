---
name: react-compound-components
description: Guide for implementing React compound component patterns with dot notation in this codebase. Use when creating new UI components that have multiple related sub-components, building forms, dashboards, or pages with distinct sections, or when refactoring components that have complex prop drilling. Activates for component composition, context providers, reusable UI patterns.
allowed-tools: Read, Write, Edit, Glob, Grep
---

# React Compound Components Pattern

## Overview

This codebase uses compound components with dot notation for flexible, composable UI patterns. This approach allows consumers to declaratively compose components while sharing state through React Context.

## When to Use This Pattern

Use compound components when:

- A component has multiple related sub-parts (e.g., Header, Body, Footer)
- Props need to be shared between parent and children without drilling
- Consumers need flexibility in how they compose the UI
- You want a declarative API that reads like documentation

**Don't use** compound components for:

- Simple components with 1-2 props
- Components that don't have logical sub-parts
- One-off components that won't be reused

## Existing Compound Components in This Codebase

### 1. Team Component (`components/Team/`)

```tsx
import Team from '@/components/Team';

// Full composition
<Team team={teamData} gameweek={20}>
  <Team.ShareButton />
  <Team.Summary />
  <Team.Formation>
    <Team.Position type="goa" />
    <Team.Position type="def" />
    <Team.Position type="mid" />
    <Team.Position type="fwd" />
    <Team.Bench />
  </Team.Formation>
</Team>

// Backwards compatible - renders default composition
<Team team={teamData} gameweek={20} />
```

**Sub-components:**

- `Team.ShareButton` - Share button with loading state
- `Team.Summary` - Stats summary bar (cost, predicted, transfers)
- `Team.Formation` - Wrapper for position rows
- `Team.Position` - Position row (type: 'goa' | 'def' | 'mid' | 'fwd')
- `Team.Bench` - Bench players section

### 2. Dashboard Component (`components/Dashboard/`)

```tsx
import Dashboard from '@/components/Dashboard';

<Dashboard
  className={styles.pageContainer}
  onPlayerClick={handlePlayerClick}
  onHotPlayerClick={handleHotPlayerClick}
>
  <Dashboard.Header
    title="Team Name"
    subtitle="Manager Name"
    ctaText="Optimize your team"
    ctaHref="/optimize"
  />

  <Dashboard.Stats
    stats={[
      { title: 'GW20', value: 65, description: 'Rank: 1,234' },
      { title: 'Overall', value: 1250, description: 'Rank: 50,000' },
    ]}
  />

  <Dashboard.PerformanceChart data={historyData} currentGameweek={20} />

  <Dashboard.Deadline gameweekName="GW21" deadlineTime={deadline} />

  <Dashboard.TeamGrid title="Starting XI" players={startingXI} />
  <Dashboard.TeamGrid title="Bench" players={bench} />

  <Dashboard.HotPlayers players={hotPlayers} />

  <Dashboard.GameweekInfo gameweek={gameweekData} />

  <Dashboard.AuthCTA isLoggedIn={!!user} hasFplTeamId={!!fplTeamId} />
</Dashboard>;
```

**Sub-components:**

- `Dashboard.Header` - Page header with title, subtitle, CTA
- `Dashboard.Stats` - Row of stat cards
- `Dashboard.Section` - Generic section wrapper
- `Dashboard.PerformanceChart` - Weekly performance chart
- `Dashboard.Deadline` - Next deadline display
- `Dashboard.TeamGrid` - Player card grid
- `Dashboard.HotPlayers` - Hot players section
- `Dashboard.GameweekInfo` - Gameweek info for welcome page
- `Dashboard.AuthCTA` - Login/signup prompt

### 3. PlayersPage Component (`components/PlayersPage/`)

```tsx
import PlayersPage from '@/components/PlayersPage';

<PlayersPage
  className={styles.pageContainer}
  view={view}
  onTabChange={handleTabChange}
  refetching={refetching}
>
  <PlayersPage.Header title="Players" />
  <PlayersPage.Tabs />

  <PlayersPage.SearchInput
    value={search}
    onChange={setSearch}
    placeholder="Search players..."
  />

  <PlayersPage.Table
    data={players}
    columns={columns}
    sortBy={sortBy}
    sortOrder={sortOrder}
    onSort={handleSort}
    onRowClick={handleRowClick}
  />

  <PlayersPage.LoadingSkeleton />
  <PlayersPage.ErrorState error={error} onRetry={handleRetry} />
  <PlayersPage.EmptyState onRetry={handleRetry} />
  <PlayersPage.InlineError error={error} onRetry={handleRetry} />
</PlayersPage>;
```

### 4. AuthForm Component (`components/AuthForm/`)

```tsx
import AuthForm from '@/components/AuthForm';

<AuthForm
  onSubmit={handleSubmit}
  loading={loading}
  error={error}
  success={success}
  hideFormOnSuccess
>
  <AuthForm.Header title="Welcome back" subtitle="Sign in to your account" />

  <AuthForm.Messages redirectMessage={redirectMessage} />

  <AuthForm.Form>
    <AuthForm.Group>
      <AuthForm.Label htmlFor="email">Email</AuthForm.Label>
      <AuthForm.Input
        id="email"
        name="email"
        type="email"
        placeholder="you@example.com"
        required
        autoComplete="email"
      />
    </AuthForm.Group>

    <AuthForm.Group>
      <AuthForm.Label htmlFor="password" forgotPasswordLink>
        Password
      </AuthForm.Label>
      <AuthForm.Input
        id="password"
        name="password"
        type="password"
        placeholder="Your password"
        required
        autoComplete="current-password"
      />
    </AuthForm.Group>

    <AuthForm.SubmitButton loadingText="Signing in...">
      Sign in
    </AuthForm.SubmitButton>
  </AuthForm.Form>

  <AuthForm.Footer>
    Don't have an account? <AuthForm.Link href="/signup">Sign up</AuthForm.Link>
  </AuthForm.Footer>
</AuthForm>;
```

### 5. Modal Component (`components/UIKit/Modal/`)

```tsx
import Modal from '@/components/UIKit/Modal';

<Modal open={isOpen} doClose={handleClose} closeIcon>
  <Modal.Inner size="medium">
    <Modal.Header>Modal Title</Modal.Header>
    <Modal.Content>
      <p>Modal content goes here</p>
    </Modal.Content>
  </Modal.Inner>
</Modal>;
```

## Implementation Pattern

### Step 1: Create Context

```tsx
'use client';

import React, {
  createContext,
  useContext,
  type PropsWithChildren,
} from 'react';

interface MyComponentContextType {
  sharedState: string;
  onAction?: (value: string) => void;
}

const MyComponentContext = createContext<MyComponentContextType | null>(null);

function useMyComponentContext() {
  const context = useContext(MyComponentContext);
  if (!context) {
    throw new Error(
      'MyComponent compound components must be used within a MyComponent',
    );
  }
  return context;
}
```

### Step 2: Create Root Component with Type Annotation

```tsx
interface MyComponentOwnProps {
  sharedState: string;
  onAction?: (value: string) => void;
  className?: string;
}

const MyComponent: React.FC<PropsWithChildren<MyComponentOwnProps>> & {
  Header: typeof MyComponentHeader;
  Content: typeof MyComponentContent;
  Footer: typeof MyComponentFooter;
} = ({ children, sharedState, onAction, className }) => {
  return (
    <MyComponentContext.Provider value={{ sharedState, onAction }}>
      <div className={className}>{children}</div>
    </MyComponentContext.Provider>
  );
};
```

### Step 3: Create Sub-Components

```tsx
// Sub-component with own props
interface MyComponentHeaderProps {
  title: string;
  subtitle?: string;
}

const MyComponentHeader: React.FC<MyComponentHeaderProps> = ({
  title,
  subtitle,
}) => (
  <header>
    <h1>{title}</h1>
    {subtitle && <p>{subtitle}</p>}
  </header>
);
MyComponentHeader.displayName = 'MyComponentHeader';
MyComponent.Header = MyComponentHeader;

// Sub-component using context
const MyComponentContent: React.FC<PropsWithChildren> = ({ children }) => {
  const { sharedState } = useMyComponentContext();

  return (
    <div>
      <span>State: {sharedState}</span>
      {children}
    </div>
  );
};
MyComponentContent.displayName = 'MyComponentContent';
MyComponent.Content = MyComponentContent;

// Sub-component with children
const MyComponentFooter: React.FC<PropsWithChildren> = ({ children }) => (
  <footer>{children}</footer>
);
MyComponentFooter.displayName = 'MyComponentFooter';
MyComponent.Footer = MyComponentFooter;
```

### Step 4: Export

```tsx
MyComponent.displayName = 'MyComponent';

export default MyComponent;
```

## File Structure

```
components/
  MyComponent/
    MyComponent.tsx        # Main component with all sub-components
    MyComponent.module.scss # Styles
    index.tsx              # Re-exports
```

**index.tsx:**

```tsx
import MyComponent from './MyComponent';

export default MyComponent;
```

## TypeScript Patterns

### Using PropsWithChildren

```tsx
import { type PropsWithChildren } from 'react';

// For components that accept children
const MyComponent: React.FC<PropsWithChildren<OwnProps>> = ({
  children,
  ...props
}) => {
  // ...
};

// For components that only accept children
const Wrapper: React.FC<PropsWithChildren> = ({ children }) => (
  <div>{children}</div>
);
```

### Compound Component Type Definition

```tsx
// Define the compound component type with all sub-components
const MyComponent: React.FC<PropsWithChildren<OwnProps>> & {
  Header: typeof MyComponentHeader;
  Content: typeof MyComponentContent;
  Footer: typeof MyComponentFooter;
} = (props) => {
  // ...
};

// Attach sub-components after definition
MyComponent.Header = MyComponentHeader;
MyComponent.Content = MyComponentContent;
MyComponent.Footer = MyComponentFooter;
```

## Best Practices

### 1. Backwards Compatibility

When refactoring existing components, maintain backwards compatibility:

```tsx
const Team = ({ team, gameweek, children }: TeamProps) => {
  // Default composition when no children provided
  const defaultContent = (
    <>
      <Team.ShareButton />
      <Team.Summary />
      <Team.Formation>
        <Team.Position type="goa" />
        <Team.Position type="def" />
        <Team.Position type="mid" />
        <Team.Position type="fwd" />
        <Team.Bench />
      </Team.Formation>
    </>
  );

  return (
    <TeamContext.Provider value={{ team, gameweek }}>
      <div>{children ?? defaultContent}</div>
    </TeamContext.Provider>
  );
};
```

### 2. DisplayName for Debugging

Always set displayName for better debugging:

```tsx
MyComponentHeader.displayName = 'MyComponentHeader';
MyComponent.Header = MyComponentHeader;
```

### 3. Context Error Messages

Provide helpful error messages when context is missing:

```tsx
function useMyComponentContext() {
  const context = useContext(MyComponentContext);
  if (!context) {
    throw new Error('MyComponent.Header must be used within a MyComponent');
  }
  return context;
}
```

### 4. Event Handler Props on Root

Pass event handlers to the root component, access via context:

```tsx
// Root receives handlers
<Dashboard onPlayerClick={handleClick}>

// Sub-components access via context
const DashboardTeamGrid = ({ players }) => {
  const { onPlayerClick } = useDashboardContext();

  return (
    <div>
      {players.map(player => (
        <div key={player.id} onClick={() => onPlayerClick?.(player)}>
          {player.name}
        </div>
      ))}
    </div>
  );
};
```

### 5. Flexible Sub-Components

Allow sub-components to be used independently or composed:

```tsx
// Can be used with default content
<Dashboard.Section title="Stats">
  <CustomContent />
</Dashboard.Section>

// Or with built-in functionality
<Dashboard.Stats stats={statsArray} />
```

## Anti-Patterns to Avoid

### ❌ Don't: Over-nest Context

```tsx
// Bad - too many nested contexts
<OuterContext>
  <MiddleContext>
    <InnerContext>
      <Content />
    </InnerContext>
  </MiddleContext>
</OuterContext>
```

### ❌ Don't: Pass All Props Down

```tsx
// Bad - prop drilling defeats the purpose
<MyComponent.Item {...allProps} onClick={onClick} disabled={disabled} />
```

### ❌ Don't: Require Specific Children Order

```tsx
// Bad - forces specific order
<MyComponent>
  <MyComponent.Header /> {/* Must be first */}
  <MyComponent.Content /> {/* Must be second */}
</MyComponent>
```

### ✅ Do: Use Context for Shared State

```tsx
// Good - context handles shared state
<MyComponent state={state} onAction={onAction}>
  <MyComponent.Header title="Title" />
  <MyComponent.Content />
</MyComponent>
```

## Migration Checklist

When converting an existing component to compound pattern:

- [ ] Identify logical sub-sections of the component
- [ ] Create context type with shared state/handlers
- [ ] Create root component with context provider
- [ ] Extract sub-components with displayName
- [ ] Attach sub-components to root (Root.SubComponent)
- [ ] Add backwards compatibility if needed
- [ ] Create index.tsx for clean exports
- [ ] Update existing usages
- [ ] Add TypeScript types for all props

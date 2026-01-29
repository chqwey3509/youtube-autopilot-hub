import React, { useState } from 'react';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import ScriptView from './components/ScriptView';
import Assistant from './components/Assistant';
import { Tab } from './types';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>(Tab.DASHBOARD);

  const renderContent = () => {
    switch (activeTab) {
      case Tab.DASHBOARD:
        return <Dashboard />;
      case Tab.SCRIPT:
        return <ScriptView />;
      case Tab.ASSISTANT:
        return <Assistant />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <Layout activeTab={activeTab} onTabChange={setActiveTab}>
      {renderContent()}
    </Layout>
  );
};

export default App;
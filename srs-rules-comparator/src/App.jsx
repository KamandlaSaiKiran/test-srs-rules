import React, { useState } from "react";
import { XMLParser } from "fast-xml-parser";

function App() {
  const [oldXml, setOldXml] = useState(null);
  const [newXml, setNewXml] = useState(null);
  const [results, setResults] = useState({ dropped: [], new: [], matched: [] });
  const [enrichedDropped, setEnrichedDropped] = useState([]);
  const [enrichedMatched, setEnrichedMatched] = useState([]);
  const [dbCreds, setDbCreds] = useState({
    username: '',
    password: '',
    host: '',
    port: '',
    serviceName: ''
  });
  const [loading, setLoading] = useState(false);

  const handleFile = (e, setXml) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
      setXml(event.target.result);
    };
    reader.readAsText(file);
  };

  const extractRules = (xml) => {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "",
      parseNodeValue: false,
      trimValues: true,
      ignoreDeclaration: true,
      removeNSPrefix: true,
    });

    const parsed = parser.parse(xml);

    const findRules = (obj) => {
      let found = [];
      if (obj == null || typeof obj !== "object") return found;

      if (obj.rule) {
        if (Array.isArray(obj.rule)) {
          found = found.concat(obj.rule);
        } else {
          found.push(obj.rule);
        }
      }

      for (const key of Object.keys(obj)) {
        if (typeof obj[key] === "object") {
          found = found.concat(findRules(obj[key]));
        }
      }

      return found;
    };

    const rulesArray = findRules(parsed);

    return rulesArray.map((rule) => {
      let description = "";
      const displayName = rule.display_name || '';
      if (rule.documentation) {
        const docContent =
          typeof rule.documentation === "string"
            ? rule.documentation
            : rule.documentation["#text"] || "";
    
        const pMatches = Array.from(docContent.matchAll(/<p>([\s\S]*?)<\/p>/gi));
        const preMatches = Array.from(docContent.matchAll(/<pre>([\s\S]*?)<\/pre>/gi));
        // const tableMatches = Array.from(docContent.matchAll(/<table[\s\S]*?<\/table>/gi));
        let setNameTable = "";
    // Find tables
        const tableMatches = Array.from(docContent.matchAll(/<table[\s\S]*?<\/table>/gi));
        if (tableMatches.length > 0) {
      // Process the first table (or loop if you expect more)
      const table = tableMatches[0][0];  // full table HTML

      // Find the set_name row inside this table
      const setNameRowMatch = table.match(
        /<tr>[\s\S]*?<td[^>]*>\s*<i>\s*set_name\s*<\/i>\s*<\/td>[\s\S]*?<\/tr>/i
      );

      if (setNameRowMatch) {
        // Only keep the <tr> for set_name
        setNameTable = `<br/><table border="1" width="600">${setNameRowMatch[0].trim()}</table>`;
      }
    }
      
        const combinedContent = [
          ...pMatches.map((m) => m[1].trim()),
          ...preMatches.map((m) => m[1].trim()),
          // ...tableMatches.map((m) => m[0].trim()),
        ]
        .filter((content) => content)
        .join(" ");
          // .filter((content) => content)
          // .join(" ");
    
        // description = combinedContent;
        description = combinedContent + (setNameTable ? setNameTable : "");
        // if (tableContent) {
        //   combinedContent.push(tableContent);
        // }
    
        // description = combinedContent
        //   .filter((content) => content)
        //   .join(" ");
      }

      
      const fullDescription = displayName
      ? `<strong>${displayName}</strong><br/>${description}`
      : description;
  
    return {
      name: rule.name,
      description: fullDescription,
    };
    });
  };

  const fetchDbData = async (rules, setState) => {
    const enriched = await Promise.all(
      rules.map(async (rule) => {
        try {
          const response = await fetch("http://localhost:5000/rule", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: rule.name,
              dbCreds
            })
          });
          const data = await response.json();
          if (data && data.status && data.status === "Not Found") {
            return { ...rule, dbData: { status: "Not Configured in DB" } };
          }
          return { ...rule, dbData: data };
        } catch (error) {
          console.error("Error fetching DB data:", error);
          return { ...rule, dbData: { status: "Error fetching data" } };
        }
      })
    );
    setState(enriched);
  };

  const compare = async () => {
    if (!oldXml || !newXml) {
      alert("Please upload both XML files.");
      return;
    }

    if (!dbCreds.username || !dbCreds.password || !dbCreds.host || !dbCreds.port || !dbCreds.serviceName) {
      alert("Please fill in all database credentials.");
      return;
    }

    setLoading(true);

    const oldRules = extractRules(oldXml);
    const newRules = extractRules(newXml);

    const oldMap = new Map(
      oldRules.map((r) => [r.name, r.description])  // 👈 use 'name' as key
    );
    const newMap = new Map(
      newRules.map((r) => [r.name, r.description])  // 👈 use 'name' as key
    );
    
    const dropped = oldRules.filter((r) => !newMap.has(r.name));   // 👈 compare by 'name'
    const newOnes = newRules.filter((r) => !oldMap.has(r.name));   // 👈 compare by 'name'
    const matched = newRules.filter((r) => oldMap.has(r.name));    // 👈 compare by 'name'
    

    setResults({ dropped: [], new: [], matched: [] });
    setEnrichedDropped([]);
    setEnrichedMatched([]);

    setResults({ dropped, new: newOnes, matched });

    await fetchDbData(dropped, setEnrichedDropped);
    await fetchDbData(matched, setEnrichedMatched);

    setLoading(false);
  };

  const downloadCSV = (data, filename, type) => {
    let csvContent = "";
    if (type === "dropped" || type === "matched") {
      csvContent = "Rule Name,Description,DB Data\n";
      data.forEach((rule) => {
        const dbData =
          rule.dbData?.status ??
          Object.entries(rule.dbData || {})
            .map(([key, val]) => `${key}: ${val}`)
            .join("\n");
        const desc = rule.description ? rule.description.replace(/[\r\n]+/g, ' ').replace(/"/g, '""') : '';
        csvContent += `"${rule.name}","${desc}","${dbData}"\n`;
      });
    } else if (type === "new") {
      csvContent = "Rule Name,Description\n";
      data.forEach((rule) => {
        const desc = rule.description ? rule.description.replace(/[\r\n]+/g, ' ').replace(/"/g, '""') : '';
        csvContent += `"${rule.name}","${desc}"\n`;
      });
    }

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div>
      <div className="navbar bg-primary text-primary-content">
        <div className="flex justify-center w-full ">
          <a className="btn btn-ghost text-xl">NMS-SRS Rules Upgrade Toolkit</a>
        </div>
      </div>

      <div className="p-6">
        <h2 className="text-lg font-bold my-4">Upload XML Files</h2>
        <div className="flex flex-col md:flex-row gap-4">
          <label className="form-control w-full max-w-xs">
            <span className="label-text">Old XML (2.4)</span>
            <input type="file" accept=".xml" className="file-input file-input-bordered w-full" onChange={(e) => handleFile(e, setOldXml)} />
          </label>
          <label className="form-control w-full max-w-xs">
            <span className="label-text">New XML (2.6)</span>
            <input type="file" accept=".xml" className="file-input file-input-bordered w-full" onChange={(e) => handleFile(e, setNewXml)} />
          </label>
        </div>

        <h2 className="text-lg font-bold mt-6">Database Credentials</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-lg">
          <input type="text" placeholder="Username" className="input input-bordered w-full" value={dbCreds.username} onChange={(e) => setDbCreds({ ...dbCreds, username: e.target.value })} />
          <input type="password" placeholder="Password" className="input input-bordered w-full" value={dbCreds.password} onChange={(e) => setDbCreds({ ...dbCreds, password: e.target.value })} />
          <input type="text" placeholder="Host" className="input input-bordered w-full" value={dbCreds.host} onChange={(e) => setDbCreds({ ...dbCreds, host: e.target.value })} />
          <input type="text" placeholder="Port" className="input input-bordered w-full" value={dbCreds.port} onChange={(e) => setDbCreds({ ...dbCreds, port: e.target.value })} />
          <input type="text" placeholder="Service Name" className="input input-bordered w-full" value={dbCreds.serviceName} onChange={(e) => setDbCreds({ ...dbCreds, serviceName: e.target.value })} />
        </div>

        <button onClick={compare} className="btn btn-primary mt-6">
          Compare
        </button>

        {loading && <div className="alert alert-info mt-4">Loading data, please wait...</div>}
          {/* 📊 DASHBOARD SECTION */}
        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="card bg-gray-100 p-4 shadow">
            <div className="text-center text-lg font-semibold">Dropped Rules</div>
            <div className="text-center text-3xl font-bold text-red-500">{results.dropped.length}</div>
          </div>
          <div className="card bg-gray-100 p-4 shadow">
            <div className="text-center text-lg font-semibold">New Rules</div>
            <div className="text-center text-3xl font-bold text-green-500">{results.new.length}</div>
          </div>
          <div className="card bg-gray-100 p-4 shadow">
            <div className="text-center text-lg font-semibold">Matched Rules</div>
            <div className="text-center text-3xl font-bold text-blue-500">{results.matched.length}</div>
          </div>
        </div>
        {/* 📊 DASHBOARD SECTION */}
        <div className="mt-10">
          <h3 className="text-lg font-bold flex items-center">
            Dropped Rules
            <button className="btn btn-sm btn-outline ml-4" onClick={() => downloadCSV(enrichedDropped, "dropped_rules.csv", "dropped")}>Download CSV</button>
          </h3>
          <div className="overflow-x-auto mt-2">
          <table className="table table-zebra border-2 border-gray-500">
  <thead>
    <tr className="border-2 border-gray-500">
      <th className="border-2 border-gray-500">Rule Name</th>
      <th className="border-2 border-gray-500">Description</th>
      <th className="border-2 border-gray-500 min-w-[300px]">DB Data</th>
    </tr>
  </thead>
  <tbody>
    {enrichedDropped.map((rule) => (
      <tr key={rule.name} className="border-2 border-gray-500">
        <td className="border-2 border-gray-500">{rule.name}</td>
        <td
          className="border-2 border-gray-500"
          dangerouslySetInnerHTML={{ __html: rule.description }}
        />
        <td className="border-2 border-gray-500 whitespace-pre-wrap">
          {rule.dbData?.status
            ? rule.dbData.status
            : Object.entries(rule.dbData)
                .map(([key, val]) => `${key}: ${val}`)
                .join("\n")}
        </td>
      </tr>
    ))}
  </tbody>
</table>
          </div>

          <h3 className="text-lg font-bold flex items-center mt-10">
            New Rules
            <button className="btn btn-sm btn-outline ml-4" onClick={() => downloadCSV(results.new, "new_rules.csv", "new")}>Download CSV</button>
          </h3>
          <div className="overflow-x-auto mt-2">
          <table className="table table-zebra border-2 border-gray-500">
  <thead>
    <tr className="border-2 border-gray-500">
      <th className="border-2 border-gray-500">Rule Name</th>
      <th className="border-2 border-gray-500">Description</th>
    </tr>
  </thead>
  <tbody>
    {results.new.map((rule) => (
      <tr key={rule.name} className="border-2 border-gray-500">
        <td className="border-2 border-gray-500">{rule.name}</td>
        <td
          className="border-2 border-gray-500"
          dangerouslySetInnerHTML={{ __html: rule.description }}
        />
      </tr>
    ))}
  </tbody>
</table>

          </div>

          <h3 className="text-lg font-bold flex items-center mt-10">
            Matched Rules
            <button className="btn btn-sm btn-outline ml-4" onClick={() => downloadCSV(enrichedMatched, "matched_rules.csv", "matched")}>Download CSV</button>
          </h3>
          <div className="overflow-x-auto mt-2">
          <table className="table table-zebra border-2 border-gray-500">
  <thead>
    <tr className="border-2 border-gray-500">
      <th className="border-2 border-gray-500">Rule Name</th>
      <th className="border-2 border-gray-500">Description</th>
      <th className="border-2 border-gray-500 min-w-[300px]">DB Data</th>
    </tr>
  </thead>
  <tbody>
    {enrichedMatched.map((rule) => (
      <tr key={rule.name} className="border-2 border-gray-500">
        <td className="border-2 border-gray-500">{rule.name}</td>
        <td
          className="border-2 border-gray-500"
          dangerouslySetInnerHTML={{ __html: rule.description }}
        />
        <td className="border-2 border-gray-500 whitespace-pre-wrap">
          {rule.dbData?.status
            ? rule.dbData.status
            : Object.entries(rule.dbData)
                .map(([key, val]) => `${key}: ${val}`)
                .join("\n")}
        </td>
      </tr>
    ))}
  </tbody>
</table>

          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
